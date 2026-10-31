// Supabase Edge Function (Deno): Mercado Pago account linking for Moni Plus. Actions: start | unlink | sync.
//
// Security model:
//   * verify_jwt = true (supabase/config.toml) plus an explicit getUser(): the caller is whoever the JWT says.
//   * `start` needs an active Plus entitlement and an explicit consent version; the OAuth `state` is server-made,
//     only its sha256 is stored. `unlink` works for any user holding a connection.
//   * The service-role client is the only door to mp_connections / mp_oauth_states (no client access).
//   * MP_CLIENT_ID / MP_CLIENT_SECRET / MP_OAUTH_REDIRECT_URI stay in Edge secrets. Tokens, the secret and
//     Mercado Pago bodies are never logged or returned.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import { buildAuthorizeUrl } from '../_shared/mpApi.ts'
import { isAuthenticatedUserJwt, pickAllowedOrigin } from '../parse-movements/lib.ts'
import {
  claimManualSync,
  handleStart,
  handleSync,
  handleUnlink,
  MAX_BODY_BYTES,
  parseRequest,
  randomState,
  type ConnectionStatus,
  type HandlerResult,
} from './lib.ts'

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
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseRequest(body)
  if (!parsed.ok) return jsonResponse(400, { error: 'invalid_request' }, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('MP_CLIENT_ID')
  const redirectUri = Deno.env.get('MP_OAUTH_REDIRECT_URI')
  if (!supabaseUrl || !anonKey || !serviceKey || !clientId || !redirectUri) {
    console.error('mp-oauth: missing environment configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return jsonResponse(401, { error: 'not_authenticated' }, origin)
  const userId = userData.user.id

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let result: HandlerResult
  if (parsed.action === 'start') {
    result = await handleStart(
      {
        isPlus: async (id) => {
          const { data, error } = await admin.rpc('is_plus_user', { p_user: id })
          if (error) throw new Error('is_plus_failed')
          return data === true
        },
        recentStateCount: async (id) => {
          const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
          const { count, error } = await admin
            .from('mp_oauth_states')
            .select('state_hash', { count: 'exact', head: true })
            .eq('user_id', id)
            .gte('created_at', since)
          if (error) throw new Error('count_failed')
          return count ?? 0
        },
        saveState: async (row) => {
          const { error } = await admin.from('mp_oauth_states').insert({
            state_hash: row.stateHash,
            user_id: row.userId,
            import_window: row.importWindow,
            consent_version: row.consentVersion,
          })
          if (error) throw new Error('save_state_failed')
        },
        randomState,
        authorizeUrl: (state) => buildAuthorizeUrl({ clientId, redirectUri }, state),
      },
      {
        userId,
        accepted: parsed.accepted,
        consentVersion: parsed.consentVersion,
        importWindow: parsed.importWindow,
      },
    )
  } else if (parsed.action === 'unlink') {
    result = await handleUnlink(
      {
        loadConnection: async (id) => {
          const { data, error } = await admin
            .from('mp_connections')
            .select('status')
            .eq('user_id', id)
            .maybeSingle()
          if (error) throw new Error('load_failed')
          return data ? { status: data.status as ConnectionStatus } : null
        },
        // V4 (WU0): no revoke endpoint is documented. Best effort is a no-op until one is confirmed; the UI links
        // to Mercado Pago's connected-apps page and the mp-connect webhook handles deauthorization.
        revoke: async () => {},
        markUnlinked: async (id) => {
          const { error } = await admin
            .from('mp_connections')
            .update({
              status: 'unlinked',
              access_token_enc: null,
              refresh_token_enc: null,
              key_version: null,
              sync_lease_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', id)
          if (error) throw new Error('unlink_failed')
        },
      },
      { userId },
    )
  } else {
    // sync now: Plus gate + 5-minute guard here, then the shared mp-sync core runs for this user only.
    const cronSecret = Deno.env.get('MP_SYNC_CRON_SECRET')
    if (!cronSecret) {
      console.error('mp-oauth: missing MP_SYNC_CRON_SECRET')
      return jsonResponse(500, { error: 'server_misconfigured' }, origin)
    }
    result = await handleSync(
      {
        loadConnection: async (id) => {
          const { data, error } = await admin
            .from('mp_connections')
            .select('status')
            .eq('user_id', id)
            .maybeSingle()
          if (error) throw new Error('load_failed')
          return data ? { status: data.status as ConnectionStatus } : null
        },
        isPlus: async (id) => {
          const { data, error } = await admin.rpc('is_plus_user', { p_user: id })
          if (error) throw new Error('is_plus_failed')
          return data === true
        },
        claimManualSync: (id, cutoffIso) =>
          claimManualSync(
            {
              read: async (uid) => {
                const { data, error } = await admin
                  .from('mp_connections')
                  .select('status, last_manual_sync_at')
                  .eq('user_id', uid)
                  .maybeSingle()
                if (error) throw new Error('claim_failed')
                return data ? { status: data.status as string, lastManualSyncAt: data.last_manual_sync_at as string | null } : null
              },
              stampIfDue: async (uid, stampIso, cutoff) => {
                const { data, error } = await admin
                  .from('mp_connections')
                  .update({ last_manual_sync_at: stampIso })
                  .eq('user_id', uid)
                  .eq('status', 'active')
                  .or(`last_manual_sync_at.is.null,last_manual_sync_at.lt.${cutoff}`)
                  .select('user_id')
                if (error) throw new Error('claim_failed')
                return (data?.length ?? 0) > 0
              },
              restore: async (uid, stampIso, previous) => {
                const { error } = await admin
                  .from('mp_connections')
                  .update({ last_manual_sync_at: previous })
                  .eq('user_id', uid)
                  .eq('last_manual_sync_at', stampIso)
                if (error) throw new Error('release_failed')
              },
            },
            id,
            new Date(),
            cutoffIso,
          ),
        triggerSync: async (id) => {
          const response = await fetch(`${supabaseUrl}/functions/v1/mp-sync`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-moni-cron-secret': cronSecret },
            body: JSON.stringify({ user_id: id }),
          })
          if (!response.ok) throw new Error('trigger_failed')
        },
        now: () => new Date(),
      },
      { userId },
    )
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
    console.error('mp-oauth: unexpected error', error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
