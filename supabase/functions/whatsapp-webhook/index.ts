// Supabase Edge Function (Deno): receives WhatsApp Cloud API webhooks for Moni.
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): Meta calls this URL with no Supabase JWT.
//   * GET is the subscription handshake: answered only when hub.verify_token matches WHATSAPP_VERIFY_TOKEN.
//   * POST is authenticated by X-Hub-Signature-256 (HMAC-SHA256 of the raw body, keyed with WHATSAPP_APP_SECRET),
//     checked BEFORE any JSON parsing or database work. Bad/missing signature => 401.
//   * Inbound messages are stored as-is, keyed by WhatsApp's own message id (wamid): idempotent against Meta's
//     retries. They are NOT yet linked to a Moni user — that link (how a phone number ties to an auth.users id) is
//     a separate, not-yet-built feature. This function only proves the channel works end to end.
//   * Logs carry ids and outcome labels only: never the verify token, the app secret, the signature or message text.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  MAX_BODY_BYTES,
  parseInboundMessages,
  parseVerifyRequest,
  resolveChallenge,
  verifyMetaSignature,
} from './lib.ts'

function reply(status: number, body: string | Record<string, unknown> = {}): Response {
  const isText = typeof body === 'string'
  return new Response(isText ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': isText ? 'text/plain' : 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

/** Reads the body as text, stopping as soon as it exceeds the byte cap. Returns null when over the cap. */
async function readBodyCapped(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function handleVerify(req: Request, verifyToken: string): Response {
  const parsed = parseVerifyRequest(new URL(req.url))
  const challenge = resolveChallenge(parsed, verifyToken)
  if (challenge === null) {
    console.error('whatsapp-webhook: verification handshake rejected')
    return reply(403, { error: 'verification_failed' })
  }
  return reply(200, challenge)
}

async function handleEvent(req: Request, appSecret: string): Promise<Response> {
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return reply(413, { error: 'payload_too_large' })

  if (!(await verifyMetaSignature(appSecret, req.headers.get('x-hub-signature-256'), raw))) {
    console.error('whatsapp-webhook: signature rejected')
    return reply(401, { error: 'invalid_signature' })
  }

  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    // Signed but not valid JSON: acknowledge so Meta does not retry something it will never fix by retrying.
    return reply(200, { ignored: 'invalid_json' })
  }

  const messages = parseInboundMessages(body)
  if (messages.length === 0) return reply(200, { ignored: 'no_messages' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('whatsapp-webhook: missing environment configuration')
    return reply(500, { error: 'server_misconfigured' })
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.from('whatsapp_inbound_messages').insert(
    messages.map((m) => ({
      wamid: m.wamid,
      wa_id: m.waId,
      message_type: m.kind,
      body: m.body,
      sent_at: new Date(m.timestamp * 1000).toISOString(),
    })),
  )
  // A duplicate wamid (Meta retried the same delivery) is expected and not an error: unique violation => ok.
  if (error && error.code !== '23505') {
    console.error('whatsapp-webhook: insert failed', error.code)
    return reply(500, { error: 'server_error' })
  }
  return reply(200, { handled: messages.length })
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    if (!verifyToken) {
      console.error('whatsapp-webhook: missing environment configuration')
      return reply(500, { error: 'server_misconfigured' })
    }
    return handleVerify(req, verifyToken)
  }
  if (req.method === 'POST') {
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')
    if (!appSecret) {
      console.error('whatsapp-webhook: missing environment configuration')
      return reply(500, { error: 'server_misconfigured' })
    }
    return handleEvent(req, appSecret)
  }
  return reply(405, { error: 'method_not_allowed' })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    console.error('whatsapp-webhook: unexpected error', error instanceof Error ? error.name : 'unknown')
    return reply(500, { error: 'server_error' })
  }
})
