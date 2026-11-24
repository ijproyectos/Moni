// Supabase Edge Function (Deno): receives RevenueCat webhook events for Moni Plus subscriptions bought inside the
// native app (StoreKit / Play Billing, via RevenueCat). Mirrors mp-webhook's shape; see
// supabase/migrations/20261126000000_revenuecat_plus_billing.sql for the database side.
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): RevenueCat calls this URL server-to-server, no Supabase JWT.
//     Authentication is the `Authorization` header RevenueCat is configured to resend verbatim
//     (REVENUECAT_WEBHOOK_AUTH_TOKEN), compared constant-time BEFORE any database work. Missing or wrong => 401.
//   * No CORS: this is server-to-server, browsers have no business here.
//   * Unlike Mercado Pago's webhook, the body IS trusted for the fields it uses: RevenueCat already validated the
//     purchase with Apple/Google before sending it, there is no public resource here to re-fetch and verify against.
//   * Idempotent: grant_plus_from_revenuecat() keys on RevenueCat's event id, so a redelivery grants nothing twice.
//   * Replies: 200 for handled / ignorable events, 401 for a bad auth header, 5xx for transient failures so
//     RevenueCat retries.
//   * Logs carry event type and outcome labels only: never the token, the user id or the raw payload.
//
// TODO once the RevenueCat project exists: set REVENUECAT_WEBHOOK_AUTH_TOKEN as an Edge secret to whatever string
// is configured in the RevenueCat dashboard's webhook "Authorization" header field.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { readBodyCapped } from '../_shared/http.ts'
import {
  decideEvent,
  isSafeId,
  MAX_BODY_BYTES,
  parseWebhookBody,
  timingSafeEqualStrings,
} from './lib.ts'

function reply(status: number, body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_TOKEN')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!expectedAuth || !supabaseUrl || !serviceKey) {
    console.error('revenuecat-webhook: missing environment configuration')
    return reply(500, { error: 'server_misconfigured' })
  }

  const receivedAuth = req.headers.get('Authorization') ?? ''
  if (!timingSafeEqualStrings(receivedAuth, expectedAuth)) {
    console.error('revenuecat-webhook: auth header rejected')
    return reply(401, { error: 'invalid_signature' })
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return reply(413, { error: 'payload_too_large' })
  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    body = null
  }
  const info = parseWebhookBody(body)
  if (!info) {
    console.error('revenuecat-webhook: unparseable body')
    return reply(200, { ignored: 'unparseable' })
  }

  const decision = decideEvent(info)
  if (decision.kind === 'ignore') {
    return reply(200, { ignored: decision.reason })
  }
  if (decision.kind === 'unexpected_shape') {
    // Visible in RevenueCat's webhook delivery log and retried, instead of silently dropping a possible renewal.
    console.error('revenuecat-webhook: unexpected event shape', info.type)
    return reply(500, { error: 'unexpected_shape' })
  }
  if (!isSafeId(decision.eventId)) {
    console.error('revenuecat-webhook: unsafe event id')
    return reply(200, { ignored: 'unsafe_id' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const granted = await admin.rpc('grant_plus_from_revenuecat', {
    p_user: decision.userId,
    p_event_id: decision.eventId,
    p_event_type: decision.eventType,
    p_expires_at: decision.expiresAtIso,
  })
  if (granted.error) {
    console.error('revenuecat-webhook: grant failed', granted.error.code)
    return reply(503, { error: 'try_again' })
  }
  // NULL = this event was already processed (replay): still a success for RevenueCat.
  return reply(200, { handled: granted.data ? 'granted' : 'already_processed' })
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    console.error(
      'revenuecat-webhook: unexpected error',
      error instanceof Error ? error.name : 'unknown',
    )
    return reply(500, { error: 'server_error' })
  }
})
