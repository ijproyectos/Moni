// Supabase Edge Function (Deno): receives Twilio's WhatsApp webhooks for Moni (the Twilio Sandbox/API alternative
// to supabase/functions/whatsapp-webhook's Meta Cloud API, while that one's Business Portfolio is locked pending
// Meta's own verification). Same product on both: a linked number loads an expense/income by texting Moni, or
// undoes the last one — see ../_shared/whatsappExpense.ts, which this and ../whatsapp-webhook both call into, so
// the two transports can never answer the same text two different ways.
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): Twilio calls this URL server-to-server with no Supabase JWT.
//   * One POST per message (no batching, no GET handshake — Twilio's webhook has neither).
//   * Authenticated by X-Twilio-Signature (HMAC-SHA1 over TWILIO_WEBHOOK_URL + every POST param, see lib.ts),
//     checked BEFORE any JSON/body-field work. Bad/missing signature => 401.
//   * Every DB read/write runs with the SERVICE ROLE (Twilio's call carries no user JWT): every query is
//     explicitly scoped by the resolved user_id, same as ../whatsapp-webhook.
//   * Inbound messages are stored in the SAME whatsapp_inbound_messages/whatsapp_links/whatsapp_expense_log tables
//     Meta's webhook uses: wa_id is normalized to the same digits-only, no-"+" shape (normalizeWhatsAppNumber), so
//     one real phone number is one Moni link regardless of which provider delivered the message. Twilio's
//     MessageSid fills the same `wamid` column Meta's wamid does — both are just "this provider's unique id for
//     this message", used only for idempotency.
//   * Logs carry ids and outcome labels only: never the auth token, the signature, message text, or the access
//     token.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { processInboundMessage, type ExpenseMessage } from '../_shared/whatsappExpense.ts'
import {
  buildTwilioSendForm,
  MAX_BODY_BYTES,
  normalizeWhatsAppNumber,
  paramsToRecord,
  parseTwilioMessage,
  twilioMessagesUrl,
  verifyTwilioSignature,
} from './lib.ts'

const LOG = 'twilio-whatsapp-webhook'

function reply(status: number, body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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

function makeSendReply(
  accountSid: string,
  authToken: string,
  fromAddress: string,
): (to: string, text: string) => Promise<void> {
  const basicAuth = btoa(`${accountSid}:${authToken}`)
  return async (toWaId, text) => {
    try {
      const response = await fetch(twilioMessagesUrl(accountSid), {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: buildTwilioSendForm(fromAddress, toWaId, text).toString(),
      })
      if (!response.ok) console.error(`${LOG}: reply send failed`, response.status)
    } catch (error) {
      console.error(`${LOG}: reply send failed`, error instanceof Error ? error.name : 'unknown')
    }
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const webhookUrl = Deno.env.get('TWILIO_WEBHOOK_URL')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const fromAddress = Deno.env.get('TWILIO_WHATSAPP_NUMBER')
  if (!webhookUrl || !authToken || !accountSid || !fromAddress) {
    console.error(`${LOG}: missing environment configuration`)
    return reply(500, { error: 'server_misconfigured' })
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return reply(413, { error: 'payload_too_large' })
  const params = paramsToRecord(new URLSearchParams(raw))

  if (!(await verifyTwilioSignature(authToken, webhookUrl, params, req.headers.get('x-twilio-signature')))) {
    console.error(`${LOG}: signature rejected`)
    return reply(401, { error: 'invalid_signature' })
  }

  const parsed = parseTwilioMessage(params)
  if (!parsed) return reply(200, { ignored: 'unexpected_shape' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error(`${LOG}: missing environment configuration`)
    return reply(500, { error: 'server_misconfigured' })
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const waId = normalizeWhatsAppNumber(parsed.from)
  const { error } = await admin.from('whatsapp_inbound_messages').insert({
    wamid: parsed.messageSid,
    wa_id: waId,
    message_type: parsed.body !== null ? 'text' : 'unknown',
    body: parsed.body,
    sent_at: new Date().toISOString(),
  })
  // A duplicate MessageSid (Twilio retried the same delivery) is expected and not an error: unique violation => ok.
  if (error && error.code !== '23505') {
    console.error(`${LOG}: insert failed`, error.code)
    return reply(500, { error: 'server_error' })
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const sendReply = makeSendReply(accountSid, authToken, fromAddress)
  const message: ExpenseMessage = { waId, wamid: parsed.messageSid, body: parsed.body }
  await processInboundMessage({ admin, anthropicKey, sendReply, logLabel: LOG }, message)

  return reply(200, { handled: 1 })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    console.error(`${LOG}: unexpected error`, error instanceof Error ? error.name : 'unknown')
    return reply(500, { error: 'server_error' })
  }
})
