// Supabase Edge Function (Deno): Mercado Pago payment sync. Thin wiring only; the logic lives in lib.ts,
// categorize.ts and mpFields.ts (all unit-tested under Vitest with injected fetch and database).
//
// Security model:
//   * verify_jwt = false (supabase/config.toml): callers are pg_cron (via pg_net) and mp-oauth `sync`, both sending
//     the shared secret in `x-moni-cron-secret`. The header is compared in constant time with the Edge secret
//     MP_SYNC_CRON_SECRET BEFORE any database or Mercado Pago work. The cron side reads that secret from Vault (or
//     the private.app_secrets fallback) inside the cron command, see ops/mp_sync_cron.sql (WU5).
//   * The service-role client is the only door to mp_connections / mp_imported_payments.
//   * Tokens are decrypted in memory only (_shared/tokenCrypto.ts). Tokens, payloads and Mercado Pago/Claude bodies
//     are never logged or returned.
//   * 202 + EdgeRuntime.waitUntil with a 100 s budget (D18). Without waitUntil the run is synchronous (batch of 5).

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { callAnthropic, jsonResponse, readBodyCapped } from '../_shared/http.ts'
import { createMpClient } from '../_shared/mpApi.ts'
import { decryptToken, encryptToken, parseKeyring, type Keyring } from '../_shared/tokenCrypto.ts'
import {
  AI_DAILY_LIMIT,
  AI_QUOTA_FEATURE,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  categorizePayments,
  CATEGORIZE_TIMEOUT_MS,
} from './categorize.ts'
import {
  RUN_BUDGET_MS,
  runSyncBatch,
  runUserSync,
  SyncStageError,
  verifyCronSecret,
  type SyncConnection,
  type SyncDeps,
} from './lib.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const MAX_BODY_BYTES = 256
const BATCH_SIZE = 5
const LEASE_MS = 5 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ConnectionRow {
  user_id: string
  mp_user_id: string
  status: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  expires_at: string | null
  cursor_at: string | null
  import_since: string | null
}

function toConnection(row: ConnectionRow): SyncConnection {
  return {
    userId: row.user_id,
    mpUserId: row.mp_user_id,
    status: row.status,
    accessTokenEnc: row.access_token_enc,
    refreshTokenEnc: row.refresh_token_enc,
    expiresAt: row.expires_at,
    cursorAt: row.cursor_at,
    importSince: row.import_since,
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, null)
  if (!(await verifyCronSecret(req.headers.get('x-moni-cron-secret'), Deno.env.get('MP_SYNC_CRON_SECRET')))) {
    return jsonResponse(401, { error: 'unauthorized' }, null)
  }

  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'invalid_request' }, null)
  let targetUser: string | null = null
  if (raw.trim() !== '') {
    try {
      const body = JSON.parse(raw) as { user_id?: unknown }
      if (body.user_id !== undefined) {
        if (typeof body.user_id !== 'string' || !UUID.test(body.user_id)) {
          return jsonResponse(400, { error: 'invalid_request' }, null)
        }
        targetUser = body.user_id
      }
    } catch {
      return jsonResponse(400, { error: 'invalid_request' }, null)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('MP_CLIENT_ID')
  const clientSecret = Deno.env.get('MP_CLIENT_SECRET')
  const redirectUri = Deno.env.get('MP_OAUTH_REDIRECT_URI')
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret || !redirectUri) {
    console.error('mp-sync: missing environment configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, null)
  }
  let ring: Keyring
  try {
    ring = parseKeyring(Deno.env.get('MP_TOKEN_KEYS'), Deno.env.get('MP_TOKEN_KEY_CURRENT'))
  } catch {
    console.error('mp-sync: invalid token key configuration')
    return jsonResponse(500, { error: 'server_misconfigured' }, null)
  }
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const mp = createMpClient({ clientId, clientSecret, redirectUri })

  // Claim: the whole due batch (cron) or one user's lease (sync now).
  let rows: ConnectionRow[]
  if (targetUser) {
    const { data: plus, error: plusError } = await admin.rpc('is_plus_user', { p_user: targetUser })
    if (plusError) return jsonResponse(500, { error: 'server_error' }, null)
    if (plus !== true) return jsonResponse(200, { claimed: 0 }, null)
    const now = new Date()
    const { data, error } = await admin
      .from('mp_connections')
      .update({ sync_lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
      .eq('user_id', targetUser)
      .eq('status', 'active')
      .not('refresh_token_enc', 'is', null)
      .or(`sync_lease_until.is.null,sync_lease_until.lte.${now.toISOString()}`)
      .select('*')
    if (error) return jsonResponse(500, { error: 'server_error' }, null)
    rows = (data ?? []) as ConnectionRow[]
  } else {
    const { data, error } = await admin.rpc('claim_mp_sync_batch', { p_limit: BATCH_SIZE })
    if (error) {
      console.error('mp-sync: claim failed')
      return jsonResponse(500, { error: 'server_error' }, null)
    }
    rows = (data ?? []) as ConnectionRow[]
  }
  if (rows.length === 0) return jsonResponse(200, { claimed: 0 }, null)

  const deadlineAt = Date.now() + RUN_BUDGET_MS

  const depsFor = (conn: SyncConnection): SyncDeps => ({
    mp,
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: () => Math.random(),
    decrypt: (column, ciphertext) => decryptToken(ciphertext, { userId: conn.userId, column }, ring),
    encrypt: (column, plaintext) => encryptToken(plaintext, { userId: conn.userId, column }, ring),
    persistTokens: async (tokens) => {
      const { error } = await admin
        .from('mp_connections')
        .update({
          access_token_enc: tokens.accessTokenEnc,
          refresh_token_enc: tokens.refreshTokenEnc,
          key_version: ring.current,
          expires_at: tokens.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', conn.userId)
      if (error) throw new Error('persist_tokens_failed')
    },
    findSeenIds: async (ids) => {
      const { data, error } = await admin
        .from('mp_imported_payments')
        .select('payment_id')
        .eq('owner_id', conn.userId)
        .in('payment_id', ids)
      if (error) throw new Error('seen_lookup_failed')
      return new Set((data ?? []).map((r: { payment_id: string }) => r.payment_id))
    },
    categorize: async (items) => {
      const { data, error } = await admin
        .from('categories')
        .select('id, name')
        .eq('owner_id', conn.userId)
        .eq('kind', 'expense')
        .is('archived_at', null)
        .order('created_at', { ascending: true })
      if (error) return new Map(items.map((i) => [i.paymentId, null]))
      return categorizePayments(
        {
          consumeQuota: async () => {
            const { error: quotaError } = await admin.rpc('consume_ai_quota_for', {
              p_user: conn.userId,
              p_feature: AI_QUOTA_FEATURE,
              p_daily_limit: AI_DAILY_LIMIT,
            })
            return !quotaError
          },
          callModel: async (body) =>
            anthropicKey
              ? await callAnthropic(ANTHROPIC_URL, ANTHROPIC_VERSION, anthropicKey, body, CATEGORIZE_TIMEOUT_MS, 'mp-sync')
              : null,
        },
        items,
        (data ?? []) as { id: string; name: string }[],
      )
    },
    importPayments: async (payments) => {
      const { data, error } = await admin.rpc('import_mp_payments', {
        p_owner: conn.userId,
        p_payments: payments,
      })
      if (error) {
        const text = error.message ?? ''
        if (text.includes('account_unavailable')) throw new SyncStageError('account_unavailable')
        if (text.includes('category_unavailable')) throw new SyncStageError('category_unavailable')
        throw new SyncStageError('unexpected')
      }
      const s = (data ?? {}) as Record<string, number>
      return {
        posted: s.posted ?? 0,
        voided: s.voided ?? 0,
        skipped: s.skipped ?? 0,
        needsReview: s.needs_review ?? 0,
        failed: s.failed ?? 0,
      }
    },
  })

  const work = runSyncBatch(
    {
      run: (conn) => runUserSync(depsFor(conn), conn, { deadlineAt }),
      finish: async (userId, outcome) => {
        const { error } = await admin.rpc('finish_mp_sync', {
          p_user: userId,
          p_result: outcome.result,
          p_error_class: outcome.errorClass,
          p_cursor: outcome.cursor,
        })
        if (error) throw new Error('finish_failed')
      },
      nowMs: () => Date.now(),
    },
    rows.map(toConnection),
    deadlineAt,
  ).catch(() => {
    console.error('mp-sync: batch failed')
  })

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) {
    EdgeRuntime.waitUntil(work)
    return jsonResponse(202, { status: 'accepted', claimed: rows.length }, null)
  }
  await work
  return jsonResponse(200, { status: 'done', claimed: rows.length }, null)
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req)
  } catch (error) {
    console.error('mp-sync: unexpected error', error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, null)
  }
})
