// Supabase Edge Function (Deno): "Eliminar cuenta". The ONLY place that deletes an account, with the service-role key, which never
// leaves this function. See lib.ts for the order of the steps and supabase/migrations/20261210000000_delete_account.sql for what the
// database does.
//
// Security model:
//   * verify_jwt = true (supabase/config.toml) plus an explicit getUser(): the account deleted is the one the caller's own JWT says.
//     The body only carries the confirmation word; there is no user id in it to tamper with.
//   * The service-role client is used for the deletion RPC (granted to service_role only), for reading the caller's own subscription
//     rows and for removing orphan files. MP_ACCESS_TOKEN is only read here to cancel the caller's own subscription.
//   * Logs carry only error codes and HTTP statuses.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { cancelWithFallback } from '../_shared/mpCancel.ts'
import { corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import { isAuthenticatedUserJwt, pickAllowedOrigin } from '../parse-movements/lib.ts'
import { type DeleteDeps, parseDeleteRequest, runDeleteAccount, type StoredFile, type SubscriptionRow } from './lib.ts'

const MAX_BODY_BYTES = 1024
const MP_TIMEOUT_MS = 10_000

async function mpCancelRequest(token: string, preapprovalId: string, mpStatus: string): Promise<{ status: number; json: null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MP_TIMEOUT_MS)
  try {
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: mpStatus }),
      signal: controller.signal,
    })
    return { status: response.status, json: null }
  } catch {
    return { status: 0, json: null }
  } finally {
    clearTimeout(timer)
  }
}

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse(401, { error: 'not_authenticated' }, origin)
  if (!isAuthenticatedUserJwt(authHeader.slice('Bearer '.length).trim())) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, origin)
  const request = parseDeleteRequest(raw)
  if (!request.ok) return jsonResponse(400, { error: 'invalid_request' }, origin)
  const confirmation = request.confirmation

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('delete-account: missing environment configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  // Identity: the caller's own JWT, verified by Auth.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return jsonResponse(401, { error: 'not_authenticated' }, origin)
  const userId = userData.user.id

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const deps: DeleteDeps = {
    listSubscriptions: async (id) => {
      const { data, error } = await admin.from('plus_subscriptions').select('id, preapproval_id, status').eq('user_id', id)
      return { data: (data ?? null) as SubscriptionRow[] | null, error }
    },
    storeSubscriptionActive: async (id) => {
      const { data } = await admin.from('plus_entitlements').select('source, expires_at').eq('user_id', id).maybeSingle()
      return Boolean(data && data.source === 'revenuecat' && Date.parse(String(data.expires_at)) > Date.now())
    },
    cancelMp: async (preapprovalId) => {
      if (!mpToken) return { status: 0 }
      const result = await cancelWithFallback((spelling) => mpCancelRequest(mpToken, preapprovalId, spelling))
      return { status: result.status }
    },
    deleteAccount: async (id) => {
      const { data, error } = await admin.rpc('delete_account', { p_user: id })
      return { data: (data ?? null) as { status: string; storage: StoredFile[] } | null, error }
    },
    removeStorage: async (files) => {
      const byBucket = new Map<string, string[]>()
      for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.name])
      let ok = true
      for (const [bucket, names] of byBucket) {
        const { error } = await admin.storage.from(bucket).remove(names)
        if (error) ok = false
      }
      return ok
    },
    log: (message, detail) =>
      detail === undefined ? console.error(`delete-account: ${message}`) : console.error(`delete-account: ${message}`, detail),
  }

  const result = await runDeleteAccount(deps, { userId, confirmation })
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
    console.error('delete-account: unexpected error', error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
