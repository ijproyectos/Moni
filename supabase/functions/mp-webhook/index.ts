// Supabase Edge Function (Deno): receives Mercado Pago notifications for Moni Plus subscriptions.
//
// Security model (see docs/MERCADOPAGO.md):
//   * verify_jwt = false (supabase/config.toml): Mercado Pago calls this URL without a Supabase JWT. The HMAC-SHA256
//     `x-signature` (keyed with MP_WEBHOOK_SECRET) is the authentication, and it is checked BEFORE any database or
//     Mercado Pago API work. Bad, stale or missing signature => 401.
//   * No CORS: this is server-to-server, browsers have no business here.
//   * The notification body is never trusted: it only names the resource. The resource is re-fetched from the
//     Mercado Pago API with MP_ACCESS_TOKEN, and Plus is credited only for an APPROVED payment whose amount and
//     currency equal the server-side offer.
//   * Idempotent: grant_plus_from_payment() keys on the Mercado Pago payment id, so replays credit nothing twice.
//   * Replies: 200 for handled / ignorable notifications, 5xx for transient failures so Mercado Pago retries.
//   * Logs carry topic, ids' presence and outcome labels only: never the secret, the token, the signature or payloads.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  authorizedPaymentResourceUrl,
  classifyMpFetch,
  decidePayment,
  httpStatusFor,
  isSafeId,
  MAX_BODY_BYTES,
  parseAuthorizedPayment,
  parseNotification,
  parsePreapprovalResource,
  preapprovalResourceUrl,
  supportedTopic,
  TOPIC_AUTHORIZED_PAYMENT,
  verifyWebhookSignature,
  type MpFetchClass,
} from './lib.ts'

const MP_TIMEOUT_MS = 10_000

type AdminClient = ReturnType<typeof createClient>

interface SubscriptionRef {
  id: string
  user_id: string
}

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

interface Fetched {
  kind: MpFetchClass
  json: unknown | null
}

/** GET against the Mercado Pago API. Only the HTTP status (or error class) is logged. */
async function mpGet(url: string, token: string): Promise<Fetched> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MP_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    const kind = classifyMpFetch(response.status)
    if (kind !== 'ok') {
      console.error('mp-webhook: resource fetch failed', response.status)
      return { kind, json: null }
    }
    return { kind, json: await response.json().catch(() => null) }
  } catch (error) {
    console.error(
      'mp-webhook: resource fetch failed',
      error instanceof Error ? error.name : 'unknown',
    )
    return { kind: 'transient', json: null }
  } finally {
    clearTimeout(timer)
  }
}

function failure(kind: MpFetchClass): Response {
  // 'permanent' (an unexpected 4xx) cannot be fixed by retrying: acknowledge it. 'config' is our own token.
  if (kind === 'config') return reply(httpStatusFor('config'), { error: 'server_misconfigured' })
  if (kind === 'permanent') return reply(httpStatusFor('ignored'), { ignored: 'fetch_rejected' })
  return reply(httpStatusFor('transient'), { error: 'try_again' })
}

async function findByColumn(
  admin: AdminClient,
  column: 'preapproval_id' | 'external_reference',
  value: string,
): Promise<{ row: SubscriptionRef | null; failed: boolean }> {
  const { data, error } = await admin
    .from('plus_subscriptions')
    .select('id, user_id')
    .eq(column, value)
    .maybeSingle()
  if (error) {
    console.error('mp-webhook: subscription lookup failed', error.code)
    return { row: null, failed: true }
  }
  return { row: (data as SubscriptionRef | null) ?? null, failed: false }
}

async function handlePreapproval(admin: AdminClient, token: string, id: string): Promise<Response> {
  const fetched = await mpGet(preapprovalResourceUrl(id), token)
  if (fetched.kind !== 'ok') return failure(fetched.kind)
  const info = parsePreapprovalResource(fetched.json)
  if (!info) return reply(httpStatusFor('transient'), { error: 'try_again' })
  if (!info.status) {
    console.error('mp-webhook: unknown preapproval status')
    return reply(httpStatusFor('ignored'), { ignored: 'unknown_status' })
  }
  if (info.matchesOffer === false) {
    console.error('mp-webhook: preapproval terms differ from the offer')
    return reply(httpStatusFor('ignored'), { ignored: 'offer_mismatch' })
  }

  let found = await findByColumn(admin, 'preapproval_id', info.id)
  if (found.failed) return reply(httpStatusFor('transient'), { error: 'try_again' })
  if (!found.row && info.externalReference) {
    found = await findByColumn(admin, 'external_reference', info.externalReference)
    if (found.failed) return reply(httpStatusFor('transient'), { error: 'try_again' })
  }
  if (!found.row) return reply(httpStatusFor('ignored'), { ignored: 'unknown_subscription' })

  const { error } = await admin.rpc('set_plus_subscription_status', {
    p_subscription: found.row.id,
    p_status: info.status,
    p_preapproval_id: info.id,
  })
  if (error) {
    console.error('mp-webhook: status sync failed', error.code)
    return reply(httpStatusFor('transient'), { error: 'try_again' })
  }
  return reply(httpStatusFor('handled'), { handled: 'subscription_status' })
}

async function handleAuthorizedPayment(
  admin: AdminClient,
  token: string,
  id: string,
): Promise<Response> {
  const fetched = await mpGet(authorizedPaymentResourceUrl(id), token)
  if (fetched.kind !== 'ok') return failure(fetched.kind)
  const info = parseAuthorizedPayment(fetched.json)
  if (!info) return reply(httpStatusFor('transient'), { error: 'try_again' })

  const decision = decidePayment(info)
  if (decision.kind === 'ignore') {
    if (decision.reason === 'amount_mismatch')
      console.error('mp-webhook: charge differs from the offer')
    return reply(httpStatusFor('ignored'), { ignored: decision.reason })
  }
  if (decision.kind === 'unexpected_shape') {
    // Visible in Mercado Pago's delivery history and retried, instead of silently dropping a possible payment.
    console.error('mp-webhook: unexpected authorized payment shape')
    return reply(httpStatusFor('transient'), { error: 'unexpected_shape' })
  }

  let found = await findByColumn(admin, 'preapproval_id', decision.preapprovalId)
  if (found.failed) return reply(httpStatusFor('transient'), { error: 'try_again' })
  if (!found.row) {
    // The preapproval id may not be stored yet (notification outran the create call): match by external_reference.
    const parent = await mpGet(preapprovalResourceUrl(decision.preapprovalId), token)
    if (parent.kind !== 'ok') return failure(parent.kind)
    const parentInfo = parsePreapprovalResource(parent.json)
    if (!parentInfo?.externalReference) {
      return reply(httpStatusFor('ignored'), { ignored: 'unknown_subscription' })
    }
    found = await findByColumn(admin, 'external_reference', parentInfo.externalReference)
    if (found.failed) return reply(httpStatusFor('transient'), { error: 'try_again' })
  }
  if (!found.row) return reply(httpStatusFor('ignored'), { ignored: 'unknown_subscription' })

  const granted = await admin.rpc('grant_plus_from_payment', {
    p_user: found.row.user_id,
    p_payment_id: decision.paymentId,
    p_subscription: found.row.id,
    p_amount: decision.amount,
  })
  if (granted.error) {
    console.error('mp-webhook: grant failed', granted.error.code)
    return reply(httpStatusFor('transient'), { error: 'try_again' })
  }
  // NULL = this payment was already credited (replay): still a success for Mercado Pago.
  return reply(httpStatusFor('handled'), {
    handled: granted.data ? 'granted' : 'already_processed',
  })
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  const token = Deno.env.get('MP_ACCESS_TOKEN')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !token || !supabaseUrl || !serviceKey) {
    console.error('mp-webhook: missing environment configuration')
    return reply(500, { error: 'server_misconfigured' })
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return reply(413, { error: 'payload_too_large' })
  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {
    body = null
  }
  const notification = parseNotification(body)
  const queryId = new URL(req.url).searchParams.get('data.id')

  // 1. Authenticate: nothing else happens before this passes.
  const signature = await verifyWebhookSignature({
    secret,
    signatureHeader: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataIds: [notification.dataId, queryId],
    nowMs: Date.now(),
  })
  if (!signature.ok) {
    console.error('mp-webhook: signature rejected', signature.reason)
    return reply(401, { error: 'invalid_signature' })
  }

  // 2. Route by topic. Unknown topics are acknowledged so Mercado Pago does not retry them.
  const topic = supportedTopic(notification.type ?? new URL(req.url).searchParams.get('type'))
  if (!topic || !isSafeId(signature.dataId)) {
    return reply(httpStatusFor('ignored'), { ignored: 'topic' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return topic === TOPIC_AUTHORIZED_PAYMENT
    ? await handleAuthorizedPayment(admin, token, signature.dataId)
    : await handlePreapproval(admin, token, signature.dataId)
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    console.error('mp-webhook: unexpected error', error instanceof Error ? error.name : 'unknown')
    return reply(500, { error: 'server_error' })
  }
})
