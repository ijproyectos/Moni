// Pure logic of the twilio-whatsapp-webhook Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// Twilio's WhatsApp webhook reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// Twilio's wire format is unlike Meta's in both shape and authentication:
//   * The body is `application/x-www-form-urlencoded`, not JSON — one message per request, never a batch.
//   * There is no subscription handshake: the webhook URL is configured once in the Twilio console, no GET.
//   * Authentication is X-Twilio-Signature: base64(HMAC-SHA1(AuthToken, exact_webhook_url + every POST param's
//     "key"+"value" concatenated, params sorted alphabetically by key)). The signature covers the FULL set of
//     params Twilio sent (far more than the few this function reads), and the url must be byte-for-byte the one
//     configured in the Twilio console — Supabase's edge gateway may not hand this function that exact public URL
//     back on req.url, so it is supplied explicitly as TWILIO_WEBHOOK_URL rather than trusted from the request.
//
// What this file does NOT own: once a message is extracted, what it MEANS (loading an expense, "deshacer", quota,
// reply wording) is transport-agnostic and lives in ../_shared/whatsappExpense.ts, shared with ../whatsapp-webhook.

export const MAX_BODY_BYTES = 16 * 1024

/** Constant-time comparison of two strings (the length of a signature is not secret). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** `url` + every param's "key"+"value" concatenated, params sorted alphabetically by key (Twilio's own algorithm). */
export function buildTwilioSignatureBase(url: string, params: Readonly<Record<string, string>>): string {
  let data = url
  for (const key of Object.keys(params).sort()) data += key + params[key]
  return data
}

export async function computeTwilioSignature(authToken: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)))
  return toBase64(signature)
}

export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Readonly<Record<string, string>>,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false
  const expected = await computeTwilioSignature(authToken, buildTwilioSignatureBase(url, params))
  return timingSafeEqualStrings(expected, signatureHeader)
}

// ---------------------------------------------------------------------------------------------------------
// POST payload (application/x-www-form-urlencoded)

export function paramsToRecord(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of params.entries()) out[key] = value
  return out
}

export interface TwilioInboundMessage {
  /** Raw "whatsapp:+549..." as Twilio sent it in `From` — normalize with normalizeWhatsAppNumber before matching
   *  against whatsapp_links.wa_id. */
  from: string
  messageSid: string
  body: string | null
}

/** Reads the three fields this function acts on. Returns null when `From`/`MessageSid` (both required) are missing. */
export function parseTwilioMessage(params: Readonly<Record<string, string>>): TwilioInboundMessage | null {
  const from = params.From
  const messageSid = params.MessageSid
  if (!from || !messageSid) return null
  const body = params.Body
  return { from, messageSid, body: body && body !== '' ? body : null }
}

/** "whatsapp:+5491138807642" -> "5491138807642": the same digits-only, no-plus shape whatsapp_links.wa_id uses
 *  for Meta, so one number links to one Moni account regardless of which provider delivered the message. */
export function normalizeWhatsAppNumber(twilioAddress: string): string {
  return twilioAddress.replace(/^whatsapp:/, '').replace(/^\+/, '')
}

// ---------------------------------------------------------------------------------------------------------
// Sending a reply (Twilio REST API)

export function twilioMessagesUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`
}

/** `fromAddress` is TWILIO_WHATSAPP_NUMBER as given (e.g. "+14155238886"); `toWaId` is the digits-only wa_id. */
export function buildTwilioSendForm(fromAddress: string, toWaId: string, body: string): URLSearchParams {
  return new URLSearchParams({ From: `whatsapp:${fromAddress}`, To: `whatsapp:+${toWaId}`, Body: body })
}
