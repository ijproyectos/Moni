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
import { type ActionDeps, type ActionResult, createSubscription, runUserAction } from './actions.ts'
import { buildBackUrl, MAX_BODY_BYTES, parseRequest, type SubscriptionRow } from './lib.ts'

const MP_TIMEOUT_MS = 10_000

/** Calls Mercado Pago. Logs only the HTTP status (or the error class), never headers, bodies or the token. */
async function mpFetch(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; json: unknown | null }> {
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

  const deps: ActionDeps = {
    mp: (method, url, payload) => mpFetch(method, url, mpToken, payload),
    startSubscription: async (userId, externalReference) => {
      const { data, error } = await admin.rpc('start_plus_subscription', {
        p_user: userId,
        p_external_reference: externalReference,
      })
      return { data: (data as string | null) ?? null, error }
    },
    setStatus: async (subscriptionId, status, preapprovalId) => {
      const { error } = await admin.rpc('set_plus_subscription_status', {
        p_subscription: subscriptionId,
        p_status: status,
        ...(preapprovalId ? { p_preapproval_id: preapprovalId } : {}),
      })
      return { error }
    },
    claim: async (userId, subscriptionId, kind, minSeconds) => {
      const { data, error } = await admin.rpc('claim_plus_mp_call', {
        p_user: userId,
        p_subscription: subscriptionId,
        p_kind: kind,
        p_min_seconds: minSeconds,
      })
      return { data: (data as boolean | null) ?? null, error }
    },
    // Only the caller's own rows, always filtered by the authenticated user id.
    listRows: async (userId) => {
      const { data, error } = await admin
        .from('plus_subscriptions')
        .select('id, preapproval_id, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      return { data: (data ?? null) as SubscriptionRow[] | null, error }
    },
    newReference: () => crypto.randomUUID(),
    log: (message, detail) =>
      detail === undefined
        ? console.error(`plus-subscription: ${message}`)
        : console.error(`plus-subscription: ${message}`, detail),
  }

  let result: ActionResult
  if (action === 'create') {
    // The payer e-mail comes from the authenticated user, never from the body.
    if (!user.email) return jsonResponse(400, { error: 'email_required' }, origin)
    result = await createSubscription(deps, { userId: user.id, payerEmail: user.email, backUrl })
  } else {
    result = await runUserAction(deps, { userId: user.id, action })
  }
  return jsonResponse(result.http, result.body, origin)
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
