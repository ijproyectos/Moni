// Supabase Edge Function (Deno): finishes the Mercado Pago OAuth link. Called by public/mp/callback.html with
// `{ code, state }` and the user's Supabase session JWT (Authorization header).
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): the page may arrive without a session, which is rejected with
//     `session_required` before anything is claimed or exchanged. With a session, the uid comes from Auth
//     (getUser), never from the body, and claim_mp_oauth_state requires it to match the state's user.
//   * Tokens are AES-256-GCM encrypted (_shared/tokenCrypto.ts) before they touch the database.
//   * The client credential, tokens, codes and Mercado Pago bodies are never logged or returned.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import { createMpClient } from '../_shared/mpApi.ts'
import { encryptToken, parseKeyring, type Keyring } from '../_shared/tokenCrypto.ts'
import { isAuthenticatedUserJwt, pickAllowedOrigin } from '../parse-movements/lib.ts'
import { handleCallback, MAX_BODY_BYTES, parseCallbackBody } from './lib.ts'

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, origin)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseCallbackBody(body)
  if (!parsed.ok) return jsonResponse(400, { error: 'invalid_request' }, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('MP_CLIENT_ID')
  const clientSecret = Deno.env.get('MP_CLIENT_SECRET')
  const redirectUri = Deno.env.get('MP_OAUTH_REDIRECT_URI')
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret || !redirectUri) {
    console.error('mp-oauth-callback: missing environment configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }
  let ring: Keyring
  try {
    ring = parseKeyring(Deno.env.get('MP_TOKEN_KEYS'), Deno.env.get('MP_TOKEN_KEY_CURRENT'))
  } catch {
    console.error('mp-oauth-callback: invalid token key configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Identity: the session JWT, verified by Auth. No session -> userId stays null (session_required).
  let userId: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice('Bearer '.length).trim()
    if (isAuthenticatedUserJwt(jwt)) {
      const { data, error } = await admin.auth.getUser(jwt)
      if (!error && data.user) userId = data.user.id
    }
  }

  const mp = createMpClient({ clientId, clientSecret, redirectUri })

  const result = await handleCallback(
    {
      now: () => new Date(),
      claimState: async (stateHash, callerUid) => {
        const { data, error } = await admin.rpc('claim_mp_oauth_state', {
          p_state_hash: stateHash,
          p_caller: callerUid,
        })
        if (error) {
          if (error.code === '22023') return null
          throw new Error('claim_failed')
        }
        const row = data as { import_window: 'now' | '30' | '90'; consent_version: string } | null
        return row ? { importWindow: row.import_window, consentVersion: row.consent_version } : null
      },
      exchangeCode: (code) => mp.exchangeCode(code),
      encrypt: (plaintext, column) => encryptToken(plaintext, { userId: userId ?? '', column }, ring),
      keyVersion: () => ring.current,
      ensureWallet: async (id) => {
        const { data, error } = await admin.rpc('ensure_mp_wallet', { p_user: id })
        if (error || typeof data !== 'string') throw new Error('wallet_failed')
        return data
      },
      upsertConnection: async (row) => {
        const { error } = await admin.from('mp_connections').upsert(
          {
            user_id: row.userId,
            mp_user_id: row.mpUserId,
            status: 'active',
            access_token_enc: row.accessTokenEnc,
            refresh_token_enc: row.refreshTokenEnc,
            key_version: row.keyVersion,
            expires_at: row.expiresAt,
            account_id: row.accountId,
            import_since: row.importSince,
            cursor_at: row.cursorAt,
            sync_lease_until: null,
            last_sync_status: null,
            last_error_class: null,
            consecutive_failures: 0,
            consent_version: row.consentVersion,
            consented_at: row.consentedAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        if (error) {
          if (error.code === '23505') return 'account_in_use'
          throw new Error('upsert_failed')
        }
        return 'ok'
      },
    },
    { userId, code: parsed.code, state: parsed.state },
  )
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
    console.error('mp-oauth-callback: unexpected error', error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
