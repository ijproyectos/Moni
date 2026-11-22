// Pure logic of the whatsapp-webhook Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// WhatsApp Cloud API webhook reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
//
// Two very different requests hit this one URL:
//   * GET  — Meta's one-time (or re-)subscription handshake: confirms we own WHATSAPP_VERIFY_TOKEN by echoing
//     hub.challenge back verbatim. No signature involved; the verify token itself is the secret.
//   * POST — an actual event (an inbound message, or a delivery/read status we do not act on yet). Authenticated by
//     X-Hub-Signature-256, an HMAC-SHA256 of the raw body keyed with the app's WHATSAPP_APP_SECRET (Meta's App
//     Settings > Basic), formatted "sha256=<hex>". Unlike Mercado Pago's signature, there is no timestamp to check:
//     the header carries no freshness, so replay protection instead comes from storing each wamid once (see
//     whatsapp_inbound_messages' primary key).
//
// What this file does NOT own anymore: once a message is extracted, what it MEANS (loading an expense, "deshacer",
// quota, reply wording) is transport-agnostic and lives in supabase/functions/_shared/whatsappExpense.ts, shared
// with supabase/functions/twilio-whatsapp-webhook. This file only speaks Meta's specific wire format.

export const MAX_BODY_BYTES = 16 * 1024
export const GRAPH_API_VERSION = 'v25.0'

/** Constant-time comparison of two strings (the length of a token/digest is not secret). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function computeHmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  return Array.from(signature, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyMetaSignature(
  appSecret: string,
  signatureHeader: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signatureHeader) return false
  const [scheme, hex] = signatureHeader.split('=')
  if (scheme !== 'sha256' || !hex) return false
  const expected = await computeHmacSha256Hex(appSecret, rawBody)
  return timingSafeEqualStrings(expected, hex)
}

// ---------------------------------------------------------------------------------------------------------
// GET verification handshake

export interface VerifyRequest {
  mode: string | null
  token: string | null
  challenge: string | null
}

export function parseVerifyRequest(url: URL): VerifyRequest {
  return {
    mode: url.searchParams.get('hub.mode'),
    token: url.searchParams.get('hub.verify_token'),
    challenge: url.searchParams.get('hub.challenge'),
  }
}

/** Returns the exact text to answer with, or null when the handshake should be rejected (403). */
export function resolveChallenge(request: VerifyRequest, expectedToken: string): string | null {
  if (request.mode !== 'subscribe' || !request.challenge) return null
  if (!request.token || !timingSafeEqualStrings(request.token, expectedToken)) return null
  return request.challenge
}

// ---------------------------------------------------------------------------------------------------------
// POST payload

export interface InboundMessage {
  waId: string
  wamid: string
  /** Epoch seconds, as WhatsApp sends it. */
  timestamp: number
  /** Only 'text' is captured today; anything else (image, audio, location, interactive...) is still logged as a row
   *  (so nothing is silently lost) but with a null body. */
  kind: string
  body: string | null
}

/**
 * Flattens the `entry[].changes[].value.messages[]` shape into a plain list, one row per inbound message. Delivery
 * / read `statuses` (the other thing this payload carries) are not messages and are skipped here on purpose: Moni
 * has nothing to do with them yet, and re-acknowledging a status is still a 200 from the caller regardless of
 * whether this returns an empty list.
 */
export function parseInboundMessages(body: unknown): InboundMessage[] {
  if (typeof body !== 'object' || body === null) return []
  const { entry } = body as Record<string, unknown>
  if (!Array.isArray(entry)) return []
  const out: InboundMessage[] = []
  for (const e of entry) {
    if (typeof e !== 'object' || e === null) continue
    const { changes } = e as Record<string, unknown>
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      if (typeof change !== 'object' || change === null) continue
      const { value } = change as Record<string, unknown>
      if (typeof value !== 'object' || value === null) continue
      const { messages } = value as Record<string, unknown>
      if (!Array.isArray(messages)) continue
      for (const m of messages) {
        const parsed = parseOneMessage(m)
        if (parsed) out.push(parsed)
      }
    }
  }
  return out
}

function parseOneMessage(m: unknown): InboundMessage | null {
  if (typeof m !== 'object' || m === null) return null
  const { from, id, timestamp, type, text } = m as Record<string, unknown>
  if (typeof from !== 'string' || from === '') return null
  if (typeof id !== 'string' || id === '') return null
  const ts = typeof timestamp === 'string' ? Number.parseInt(timestamp, 10) : null
  if (ts === null || !Number.isFinite(ts)) return null
  if (typeof type !== 'string' || type === '') return null
  let textBody: string | null = null
  if (type === 'text' && typeof text === 'object' && text !== null) {
    const { body } = text as Record<string, unknown>
    if (typeof body === 'string') textBody = body
  }
  return { waId: from, wamid: id, timestamp: ts, kind: type, body: textBody }
}

// ---------------------------------------------------------------------------------------------------------
// Sending a reply (WhatsApp Cloud API, Graph API)

export function graphMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`
}

export function buildSendTextPayload(to: string, body: string): Record<string, unknown> {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body } }
}
