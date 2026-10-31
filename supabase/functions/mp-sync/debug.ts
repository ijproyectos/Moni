// Diagnostic mode of mp-sync (cron-secret protected, see index.ts): runs a handful of read-only MP search variants for
// ONE connection and reports only privacy-safe shape information. Nothing is imported and no cursor / lease / status
// is touched; the only write is persisting a rotated refresh token when the access token had already expired (MP
// invalidates the old refresh token, so dropping the new one would kill the link).
//
// The report never carries amounts, descriptions, statement descriptors, emails, names, payment / payer / collector
// ids, tokens or raw bodies: only query parameter NAMES, counts, enum-like strings, key names and booleans.

import { MpApiError } from '../_shared/mpApi.ts'
import { filterPayments, type SyncConnection, type SyncDeps, type SyncStats, emptyStats } from './lib.ts'
import { buildSearchQuery, normalizePayment, SEARCH_PATH, type MpPayment } from './mpFields.ts'

export const DEBUG_WINDOW_DAYS = 7
export const DEBUG_LIMIT = '10'
const MAX_DESCRIPTORS = 5
const DAY_MS = 24 * 60 * 60 * 1000

export type DebugDeps = Pick<SyncDeps, 'mp' | 'now' | 'decrypt' | 'encrypt' | 'persistTokens'>

export interface PaymentDescriptor {
  operation_type: string | null
  status: string | null
  status_detail: string | null
  currency_id: string | null
  point_of_interaction_type: string | null
  payer_id_is_me: boolean
  collector_id_is_me: boolean
  payer_id_present: boolean
  collector_id_present: boolean
  date_created: string | null
  payer_keys: string[]
  collector_keys: string[]
}

export interface VariantReport {
  name: string
  query_params: string[]
  http_status: number | null
  error: { class: string; mp_code: string | null } | null
  paging_total: number | null
  results_length: number | null
  first_result_keys: string[]
  results: PaymentDescriptor[]
}

export interface DebugReport {
  ok: boolean
  error: string | null
  refreshed: boolean
  window_days: number
  variants: VariantReport[]
  /** Normal-sync filter stats over V1's results (seen ids unknown: voids of imported payments count as status). */
  stats: SyncStats | null
}

function obj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function idText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** Enum-like strings only (statuses, types, currency, ISO dates); anything else becomes null. */
function token(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:+-]{1,40}$/.test(value) ? value : null
}

function keyNames(value: unknown): string[] {
  return Object.keys(obj(value))
    .map((k) => k.slice(0, 40))
    .sort()
}

export function describePayment(raw: unknown, mpUserId: string): PaymentDescriptor {
  const r = obj(raw)
  const payerId = idText(obj(r.payer).id ?? r.payer_id)
  const collectorId = idText(obj(r.collector).id ?? r.collector_id)
  return {
    operation_type: token(r.operation_type),
    status: token(r.status),
    status_detail: token(r.status_detail),
    currency_id: token(r.currency_id),
    point_of_interaction_type: token(obj(r.point_of_interaction).type),
    payer_id_is_me: payerId !== null && payerId === mpUserId,
    collector_id_is_me: collectorId !== null && collectorId === mpUserId,
    payer_id_present: payerId !== null,
    collector_id_present: collectorId !== null,
    date_created: token(r.date_created),
    payer_keys: keyNames(r.payer),
    collector_keys: keyNames(r.collector),
  }
}

export function buildVariants(mpUserId: string, now: Date): { name: string; query: Record<string, string> }[] {
  const end = now.toISOString()
  const begin = new Date(now.getTime() - DEBUG_WINDOW_DAYS * DAY_MS).toISOString()
  const v1 = { ...buildSearchQuery(begin, end, 0), limit: DEBUG_LIMIT }
  const newest = { sort: 'date_created', criteria: 'desc', limit: DEBUG_LIMIT }
  return [
    { name: 'V1_normal_query', query: v1 },
    { name: 'V2_normal_plus_payer', query: { ...v1, 'payer.id': mpUserId } },
    { name: 'V3_newest_only', query: newest },
    { name: 'V4_collector_me', query: { ...newest, 'collector.id': mpUserId } },
    { name: 'V5_payer_me', query: { ...newest, 'payer.id': mpUserId } },
  ]
}

const failed = (error: string, refreshed: boolean): DebugReport => ({
  ok: false,
  error,
  refreshed,
  window_days: DEBUG_WINDOW_DAYS,
  variants: [],
  stats: null,
})

export async function runDebugSearch(deps: DebugDeps, conn: SyncConnection): Promise<DebugReport> {
  const now = deps.now()
  let refreshed = false
  let accessToken: string
  try {
    if (!conn.accessTokenEnc) return failed('token_invalid', false)
    accessToken = await deps.decrypt('access_token_enc', conn.accessTokenEnc)
    if (conn.expiresAt && new Date(conn.expiresAt).getTime() <= now.getTime()) {
      if (!conn.refreshTokenEnc) return failed('token_invalid', false)
      const tokens = await deps.mp.refreshToken(await deps.decrypt('refresh_token_enc', conn.refreshTokenEnc))
      // Same rule as the normal path (D13): persist the ROTATED refresh token before using the new access token.
      await deps.persistTokens({
        accessTokenEnc: await deps.encrypt('access_token_enc', tokens.accessToken),
        refreshTokenEnc: await deps.encrypt('refresh_token_enc', tokens.refreshToken),
        expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000).toISOString(),
      })
      accessToken = tokens.accessToken
      refreshed = true
    }
  } catch (error) {
    return failed(error instanceof MpApiError ? error.name : 'token_unavailable', refreshed)
  }

  const variants: VariantReport[] = []
  let stats: SyncStats | null = null
  for (const { name, query } of buildVariants(conn.mpUserId, now)) {
    const report: VariantReport = {
      name,
      query_params: Object.keys(query).sort(),
      http_status: null,
      error: null,
      paging_total: null,
      results_length: null,
      first_result_keys: [],
      results: [],
    }
    try {
      const body = obj(await deps.mp.get(SEARCH_PATH, accessToken, query))
      const results = Array.isArray(body.results) ? (body.results as unknown[]) : []
      const total = obj(body.paging).total
      report.http_status = 200
      report.paging_total = typeof total === 'number' && Number.isFinite(total) ? total : null
      report.results_length = results.length
      report.first_result_keys = results.length > 0 ? Object.keys(obj(results[0])).sort() : []
      report.results = results.slice(0, MAX_DESCRIPTORS).map((r) => describePayment(r, conn.mpUserId))
      if (name === 'V1_normal_query') {
        const normalized = results.map(normalizePayment).filter((p): p is MpPayment => p !== null)
        const s = emptyStats()
        s.fetched = results.length
        s.dropped.other += results.length - normalized.length
        filterPayments(normalized, {
          mpUserId: conn.mpUserId,
          importSince: conn.importSince ? new Date(conn.importSince) : null,
          seenIds: new Set(),
          stats: s,
        })
        stats = s
      }
    } catch (error) {
      if (error instanceof MpApiError) {
        report.http_status = error.status
        report.error = { class: error.name, mp_code: error.mpCode }
      } else {
        report.error = { class: 'unexpected', mp_code: null }
      }
    }
    variants.push(report)
  }
  return { ok: true, error: null, refreshed, window_days: DEBUG_WINDOW_DAYS, variants, stats }
}
