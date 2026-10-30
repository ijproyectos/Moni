// Supabase Edge Function (Deno): Moni Plus subscription actions against Mercado Pago Subscriptions
// (contract `without-plan-pending`: create the preapproval as `pending`, send the buyer to its init_point).
//
// Actions (allowlisted in the body, nothing else is read from it): create | get | pause | reactivate | cancel.
//
// Security model (see docs/MERCADOPAGO.md):
//   * verify_jwt = true (supabase/config.toml) plus an explicit getUser() call: the caller is whoever the JWT says.
//   * The offer (reason, 2999 ARS / month), the payer e-mail, the external_reference and the back_url are all decided
//     here. The browser can only name an action.
//   * The service-role client is used ONLY for the plus_subscriptions writes (SECURITY DEFINER functions granted to
//     service_role) and for reading the caller's own rows, always filtered by the authenticated user id.
//   * MP_ACCESS_TOKEN never leaves this function. Mercado Pago bodies are never returned or logged: only HTTP status
//     codes are logged.
//   * Granting Plus is NOT done here. Only the signed webhook (mp-webhook) credits time, after an approved payment.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import { isAuthenticatedUserJwt, pickAllowedOrigin } from '../parse-movements/lib.ts'
import {
  buildBackUrl,
  buildPreapprovalBody,
  canTransition,
  classifyMpFailure,
  classifyRpcError,
  isLifecycleAction,
  isMercadoPagoInitPoint,
  LIFECYCLE,
  MAX_BODY_BYTES,
  parsePreapproval,
  parseRequest,
  pickCurrentSubscription,
  preapprovalUrl,
  publicState,
  type SubscriptionRow,
} from './lib.ts'

const MP_TIMEOUT_MS = 10_000

interface MpResult {
  status: number // 0 = network error or timeout
  json: unknown | null
}

/** Calls Mercado Pago. Logs only the HTTP status (or the error class), never headers, bodies or the token. */
async function mpFetch(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  token: string,
  body?: unknown,
): Promise<MpResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MP_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error('plus-subscription: mercado pago call failed', method, response.status)
      return { status: response.status, json: null }
    }
    return { status: response.status, json: await response.json().catch(() => null) }
  } catch (error) {
    console.error(
      'plus-subscription: mercado pago call failed',
      method,
      error instanceof Error ? error.name : 'unknown',
    )
    return { status: 0, json: null }
  } finally {
    clearTimeout(timer)
  }
}

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer '))
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  if (!isAuthenticatedUserJwt(authHeader.slice('Bearer '.length).trim())) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, origin)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseRequest(body)
  if (!parsed.ok) return jsonResponse(400, { error: 'invalid_request' }, origin)
  const { action } = parsed

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
  const backUrl = buildBackUrl(Deno.env.get('APP_URL'))
  if (!supabaseUrl || !anonKey || !serviceKey || !mpToken || !backUrl) {
    console.error('plus-subscription: missing or invalid environment configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  // Identity: the caller's own JWT, verified by Auth. Everything below keys off this id.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return jsonResponse(401, { error: 'not_authenticated' }, origin)
  const user = userData.user

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (action === 'create') {
    // The payer e-mail comes from the authenticated user, never from the body.
    if (!user.email) return jsonResponse(400, { error: 'email_required' }, origin)

    const externalReference = crypto.randomUUID()
    const started = await admin.rpc('start_plus_subscription', {
      p_user: user.id,
      p_external_reference: externalReference,
    })
    if (started.error) {
      const failure = classifyRpcError(started.error)
      if (failure.http === 500) console.error('plus-subscription: start failed', started.error.code)
      return jsonResponse(failure.http, { error: failure.code }, origin)
    }
    const subscriptionId = started.data as string

    // The one place a preapproval is created: POST https://api.mercadopago.com/preapproval
    const created = await mpFetch(
      'POST',
      'https://api.mercadopago.com/preapproval',
      mpToken,
      buildPreapprovalBody({ externalReference, payerEmail: user.email, backUrl }),
    )
    if (created.status < 200 || created.status >= 300) {
      const failure = classifyMpFailure(created.status)
      return jsonResponse(failure.http, { error: failure.code }, origin)
    }
    const preapproval = parsePreapproval(created.json)
    if (!preapproval || !isMercadoPagoInitPoint(preapproval.initPoint)) {
      console.error('plus-subscription: unusable preapproval response')
      return jsonResponse(502, { error: 'payment_provider_error' }, origin)
    }

    const stored = await admin.rpc('set_plus_subscription_status', {
      p_subscription: subscriptionId,
      p_status: preapproval.status ?? 'pending',
      p_preapproval_id: preapproval.id,
    })
    if (stored.error) {
      console.error('plus-subscription: could not store preapproval', stored.error.code)
      return jsonResponse(500, { error: 'server_error' }, origin)
    }
    return jsonResponse(200, { init_point: preapproval.initPoint, status: 'pending' }, origin)
  }

  // get / pause / reactivate / cancel: only the caller's own rows.
  const rowsResult = await admin
    .from('plus_subscriptions')
    .select('id, preapproval_id, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (rowsResult.error) {
    console.error('plus-subscription: could not load subscriptions', rowsResult.error.code)
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
  const current = pickCurrentSubscription((rowsResult.data ?? []) as SubscriptionRow[])

  if (action === 'get') {
    // Best-effort reconciliation with Mercado Pago, in case a notification is late. Failures fall back to the
    // stored status. This never grants Plus.
    if (current && current.preapproval_id && current.status !== 'cancelled') {
      const live = await mpFetch('GET', preapprovalUrl(current.preapproval_id), mpToken)
      const resource = live.status === 200 ? parsePreapproval(live.json) : null
      if (resource?.status && resource.status !== current.status) {
        const synced = await admin.rpc('set_plus_subscription_status', {
          p_subscription: current.id,
          p_status: resource.status,
        })
        if (!synced.error) current.status = resource.status
      }
    }
    return jsonResponse(200, publicState(current), origin)
  }

  if (!isLifecycleAction(action)) return jsonResponse(400, { error: 'invalid_request' }, origin)
  if (!current || !current.preapproval_id) {
    return jsonResponse(404, { error: 'subscription_not_found' }, origin)
  }
  if (!canTransition(action, current.status)) {
    return jsonResponse(409, { error: 'invalid_transition' }, origin)
  }

  const rule = LIFECYCLE[action]
  const updated = await mpFetch('PUT', preapprovalUrl(current.preapproval_id), mpToken, {
    status: rule.mpStatus,
  })
  if (updated.status < 200 || updated.status >= 300) {
    const failure = classifyMpFailure(updated.status)
    return jsonResponse(failure.http, { error: failure.code }, origin)
  }
  const resource = parsePreapproval(updated.json)
  const nextStatus = resource?.status ?? rule.to
  const synced = await admin.rpc('set_plus_subscription_status', {
    p_subscription: current.id,
    p_status: nextStatus,
  })
  if (synced.error) {
    // Mercado Pago already changed; the webhook will bring the row in line. Report success of the action.
    console.error('plus-subscription: could not sync status', synced.error.code)
  }
  return jsonResponse(200, { status: nextStatus }, origin)
}

Deno.serve(async (req: Request): Promise<Response> => {
  let origin: string | null = null
  try {
    const requestOrigin = req.headers.get('Origin')
    origin = pickAllowedOrigin(requestOrigin, Deno.env.get('ALLOWED_ORIGINS'))
    if (requestOrigin && !origin) return jsonResponse(403, { error: 'origin_not_allowed' }, null)
    return await handle(req, origin)
  } catch (error) {
    console.error(
      'plus-subscription: unexpected error',
      error instanceof Error ? error.name : 'unknown',
    )
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
