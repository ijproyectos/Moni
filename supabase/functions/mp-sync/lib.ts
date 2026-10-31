// Pure sync core of the mp-sync Edge Function (no Deno / npm imports: fetch, database and crypto are injected, so
// Vitest runs it from Node). index.ts wires Supabase, the key ring and Mercado Pago around it.
//
// Rules (design D9-D13, D18): window = [cursor - 2d, run_end]; the cursor advances ONLY when the whole run completed
// (a partial run is re-read next time, which dedupe on payment_id makes safe); a full page budget halves the window;
// 429 / 5xx back off; 401 refreshes once and persists the ROTATED refresh token before the new access token is used;
// invalid_grant ends the connection as token_invalid. Logs carry labels and classes only, never tokens or payloads.
//
// Every assumption about Mercado Pago's payload shape lives in mpFields.ts (UNVERIFIED, task 0.2).

import {
  MpApiError,
  MpAuthError,
  MpInvalidGrantError,
  MpRateLimitError,
  MpServerError,
  type MpClient,
} from '../_shared/mpApi.ts'
import {
  buildSearchQuery,
  classifyOperation,
  HOME_CURRENCY,
  isSkipRunError,
  isWindowTooLarge,
  normalizePayment,
  PAGE_SIZE,
  parseSearchPage,
  sendsTextToModel,
  SEARCH_PATH,
  STATUS_APPROVED,
  VOID_STATUSES,
  type MpPayment,
} from './mpFields.ts'

export const OVERLAP_DAYS = 2
export const MAX_PAGES_PER_WINDOW = 20
export const RUN_BUDGET_MS = 100_000
export const REFRESH_AHEAD_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MIN_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_RETRIES = 3
const SERVER_ERROR_RETRIES = 2

export type SyncErrorClass =
  | 'rate_limited'
  | 'mp_unavailable'
  | 'token_invalid'
  | 'account_unavailable'
  | 'category_unavailable'
  | 'config'
  | 'unexpected'

export interface SyncConnection {
  userId: string
  mpUserId: string
  status: string
  accessTokenEnc: string | null
  refreshTokenEnc: string | null
  expiresAt: string | null
  cursorAt: string | null
  importSince: string | null
}

export interface SyncOutcome {
  result: 'ok' | 'partial' | 'error'
  errorClass: SyncErrorClass | null
  /** ISO run end when the run completed (ok), else null so the stored cursor stays put. */
  cursor: string | null
}

export interface ImportSummary {
  posted: number
  voided: number
  skipped: number
  needsReview: number
  failed: number
}

/** Row shape accepted by `import_mp_payments` (WU2). `category_id` is optional: the RPC falls back. */
export interface RpcPayment {
  payment_id: string
  status: string
  operation_type: string
  amount: number
  date_approved: string | null
  date_created: string | null
  merchant: string
  category_id?: string
}

/** Thrown by the import dependency with a ready-made class (e.g. RPC raised account_unavailable). */
export class SyncStageError extends Error {
  readonly errorClass: SyncErrorClass
  constructor(errorClass: SyncErrorClass) {
    super(`sync_stage:${errorClass}`)
    this.name = 'SyncStageError'
    this.errorClass = errorClass
  }
}

export interface SyncDeps {
  mp: Pick<MpClient, 'get' | 'refreshToken'>
  now(): Date
  sleep(ms: number): Promise<void>
  random(): number
  decrypt(column: 'access_token_enc' | 'refresh_token_enc', ciphertext: string): Promise<string>
  encrypt(column: 'access_token_enc' | 'refresh_token_enc', plaintext: string): Promise<string>
  /** Persists both ciphertexts (index.ts adds key_version) in one write. */
  persistTokens(tokens: { accessTokenEnc: string; refreshTokenEnc: string; expiresAt: string }): Promise<void>
  findSeenIds(paymentIds: string[]): Promise<Set<string>>
  /** Merchant text of purchases only (never a money_transfer's free text). Returns paymentId -> category id (null = let the RPC fall back). Must not throw. */
  categorize(items: { paymentId: string; merchant: string }[]): Promise<Map<string, string | null>>
  importPayments(rows: RpcPayment[]): Promise<ImportSummary>
}

// ---------------------------------------------------------------------------------------------------------
// Filter (D10, R2.2)

export function filterPayments(
  payments: readonly MpPayment[],
  ctx: { mpUserId: string; importSince: Date | null; seenIds: ReadonlySet<string> },
): MpPayment[] {
  const out: MpPayment[] = []
  const taken = new Set<string>()
  for (const p of payments) {
    if (taken.has(p.paymentId)) continue
    if (p.payerId !== ctx.mpUserId || p.collectorId === ctx.mpUserId) continue
    if (p.currency !== HOME_CURRENCY) continue
    const kind = classifyOperation(p)
    if (kind === 'other') continue
    if (ctx.importSince && p.dateCreated && new Date(p.dateCreated).getTime() < ctx.importSince.getTime()) continue
    const approved = p.status === STATUS_APPROVED
    const voidsSeen = kind === 'import' && VOID_STATUSES.includes(p.status) && ctx.seenIds.has(p.paymentId)
    if (!approved && !voidsSeen) continue
    taken.add(p.paymentId)
    out.push(p)
  }
  return out
}

function toRpcPayment(p: MpPayment, categoryId: string | null | undefined): RpcPayment {
  const row: RpcPayment = {
    payment_id: p.paymentId,
    status: p.status,
    operation_type: p.operationType,
    amount: p.amount,
    date_approved: p.dateApproved,
    date_created: p.dateCreated,
    merchant: p.merchant,
  }
  if (categoryId) row.category_id = categoryId
  return row
}

// ---------------------------------------------------------------------------------------------------------
// Run

class StopRun extends Error {
  readonly outcome: SyncOutcome
  constructor(result: SyncOutcome['result'], errorClass: SyncErrorClass | null) {
    super('stop_run')
    this.outcome = { result, errorClass, cursor: null }
  }
}

function classify(error: unknown): StopRun {
  if (error instanceof StopRun) return error
  if (error instanceof SyncStageError) return new StopRun('error', error.errorClass)
  if (error instanceof MpInvalidGrantError) return new StopRun('error', 'token_invalid')
  if (error instanceof MpAuthError) return new StopRun('error', 'token_invalid')
  if (error instanceof MpRateLimitError) return new StopRun('partial', 'rate_limited')
  if (error instanceof MpServerError || isSkipRunError(error)) return new StopRun('partial', 'mp_unavailable')
  if (error instanceof MpApiError) return new StopRun('error', 'unexpected')
  return new StopRun('error', 'unexpected')
}

export async function runUserSync(
  deps: SyncDeps,
  conn: SyncConnection,
  options: { deadlineAt: number },
): Promise<SyncOutcome> {
  const startedAt = deps.now()
  const importSince = conn.importSince ? new Date(conn.importSince) : null
  let accessToken: string | null = null
  let refreshToken: string | null = null
  let refreshedThisRun = false

  const overDeadline = () => deps.now().getTime() >= options.deadlineAt

  /** A ciphertext we cannot open is a configuration problem (missing/rotated key), not a dead MP token. */
  async function open(column: 'access_token_enc' | 'refresh_token_enc', ciphertext: string): Promise<string> {
    try {
      return await deps.decrypt(column, ciphertext)
    } catch {
      throw new StopRun('error', 'config')
    }
  }

  async function loadAccessToken(): Promise<string> {
    if (accessToken !== null) return accessToken
    if (!conn.accessTokenEnc) throw new StopRun('error', 'token_invalid')
    accessToken = await open('access_token_enc', conn.accessTokenEnc)
    return accessToken
  }

  async function withRetry<T>(call: () => Promise<T>): Promise<T> {
    let rateRetries = 0
    let serverRetries = 0
    for (;;) {
      try {
        return await call()
      } catch (error) {
        let wait: number
        if (error instanceof MpRateLimitError && rateRetries < RATE_LIMIT_RETRIES) {
          wait = 1000 * 2 ** rateRetries++
        } else if (error instanceof MpServerError && serverRetries < SERVER_ERROR_RETRIES) {
          wait = 1000 * 2 ** serverRetries++
        } else {
          throw error
        }
        wait += Math.floor(deps.random() * 250)
        if (deps.now().getTime() + wait >= options.deadlineAt) throw new StopRun('partial', null)
        await deps.sleep(wait)
      }
    }
  }

  /** D13: the rotated refresh token is persisted BEFORE the new access token is used. */
  async function refresh(): Promise<void> {
    if (!conn.refreshTokenEnc) throw new StopRun('error', 'token_invalid')
    const current = refreshToken ?? (await open('refresh_token_enc', conn.refreshTokenEnc))
    const tokens = await withRetry(() => deps.mp.refreshToken(current))
    await deps.persistTokens({
      accessTokenEnc: await deps.encrypt('access_token_enc', tokens.accessToken),
      refreshTokenEnc: await deps.encrypt('refresh_token_enc', tokens.refreshToken),
      expiresAt: new Date(deps.now().getTime() + tokens.expiresInSeconds * 1000).toISOString(),
    })
    accessToken = tokens.accessToken
    refreshToken = tokens.refreshToken
    refreshedThisRun = true
  }

  async function search(query: Record<string, string>): Promise<unknown> {
    const call = async () => deps.mp.get(SEARCH_PATH, await loadAccessToken(), query)
    try {
      return await withRetry(call)
    } catch (error) {
      if (!(error instanceof MpAuthError) || refreshedThisRun) throw error
      await refresh()
      return await withRetry(call)
    }
  }

  /** Filters, categorizes new payments (names only) and imports one page. Returns true when every row succeeded. */
  async function importPage(results: unknown[]): Promise<boolean> {
    const normalized = results.map(normalizePayment).filter((p): p is MpPayment => p !== null)
    if (normalized.length === 0) return true
    const seen = await deps.findSeenIds(normalized.map((p) => p.paymentId))
    const candidates = filterPayments(normalized, { mpUserId: conn.mpUserId, importSince, seenIds: seen })
    if (candidates.length === 0) return true
    const fresh = candidates.filter(
      (p) =>
        !seen.has(p.paymentId) &&
        p.status === STATUS_APPROVED &&
        classifyOperation(p) === 'import' &&
        sendsTextToModel(p),
    )
    let categories = new Map<string, string | null>()
    if (fresh.length > 0) {
      try {
        categories = await deps.categorize(fresh.map((p) => ({ paymentId: p.paymentId, merchant: p.merchant })))
      } catch {
        console.error('mp-sync: categorize failed, using fallback')
      }
    }
    // A category is only honoured for payments whose text was actually sent; the rest use the RPC fallback.
    const sent = new Set(fresh.map((p) => p.paymentId))
    const summary = await deps.importPayments(
      candidates.map((p) => toRpcPayment(p, sent.has(p.paymentId) ? categories.get(p.paymentId) : null)),
    )
    return summary.failed === 0
  }

  type WindowResult = 'done' | 'too_large'
  async function fetchWindow(beginIso: string, endIso: string): Promise<WindowResult> {
    let allRowsOk = true
    for (let pageNo = 0; pageNo < MAX_PAGES_PER_WINDOW; pageNo++) {
      if (overDeadline()) throw new StopRun('partial', null)
      const offset = pageNo * PAGE_SIZE
      let body: unknown
      try {
        body = await search(buildSearchQuery(beginIso, endIso, offset))
      } catch (error) {
        if (isWindowTooLarge(error)) return 'too_large'
        throw error
      }
      const parsed = parseSearchPage(body)
      if (!parsed) throw new StopRun('partial', 'mp_unavailable')
      if (!(await importPage(parsed.results))) allRowsOk = false
      const exhausted =
        parsed.results.length === 0 ||
        (parsed.total !== null ? offset + parsed.results.length >= parsed.total : parsed.results.length < PAGE_SIZE)
      if (exhausted) {
        if (!allRowsOk) throw new StopRun('partial', 'unexpected')
        return 'done'
      }
    }
    return 'too_large'
  }

  try {
    if (conn.expiresAt && new Date(conn.expiresAt).getTime() < startedAt.getTime() + REFRESH_AHEAD_MS) {
      await refresh()
    }
    const cursorMs = new Date(conn.cursorAt ?? conn.importSince ?? startedAt.toISOString()).getTime()
    let fromMs = cursorMs - OVERLAP_DAYS * DAY_MS
    let endMs = startedAt.getTime()
    for (;;) {
      const state = await fetchWindow(new Date(fromMs).toISOString(), new Date(endMs).toISOString())
      if (state === 'done') {
        return { result: 'ok', errorClass: null, cursor: new Date(endMs).toISOString() }
      }
      const half = Math.floor((endMs - fromMs) / 2)
      const nextEnd = fromMs + half
      if (half < MIN_WINDOW_MS) throw new StopRun('partial', null)
      if (nextEnd <= cursorMs) {
        // D9: a window this dense inside the overlap could never move the cursor (the end would land behind it). The
        // overlap is only a safety margin for late-indexed payments, so give it up for this run and read forward
        // from the cursor; later runs shrink the window as needed. The cursor never moves backwards.
        if (fromMs >= cursorMs) throw new StopRun('partial', null)
        fromMs = cursorMs
        continue
      }
      // D9: shrink run_end so a smaller window completes.
      endMs = nextEnd
    }
  } catch (error) {
    const stop = classify(error)
    console.error('mp-sync: run stopped', stop.outcome.result, stop.outcome.errorClass ?? 'none')
    return stop.outcome
  }
}

// ---------------------------------------------------------------------------------------------------------
// Batch (D18, R4.1)

export interface BatchDeps {
  run(conn: SyncConnection): Promise<SyncOutcome>
  finish(userId: string, outcome: SyncOutcome): Promise<void>
  nowMs(): number
}

export interface BatchSummary {
  processed: number
  skipped: number
  /** Claimed but not started before the deadline; the 5-minute lease expires and the next cron tick retries. */
  deferred: number
}

export async function runSyncBatch(
  deps: BatchDeps,
  connections: readonly SyncConnection[],
  deadlineAt: number,
): Promise<BatchSummary> {
  const summary: BatchSummary = { processed: 0, skipped: 0, deferred: 0 }
  for (const conn of connections) {
    // Defense in depth: claim_mp_sync_batch already returns only active, Plus, consented rows.
    if (conn.status !== 'active' || !conn.refreshTokenEnc) {
      summary.skipped++
      continue
    }
    if (deps.nowMs() >= deadlineAt) {
      summary.deferred++
      continue
    }
    let outcome: SyncOutcome
    try {
      outcome = await deps.run(conn)
    } catch {
      outcome = { result: 'error', errorClass: 'unexpected', cursor: null }
    }
    try {
      await deps.finish(conn.userId, outcome)
    } catch {
      console.error('mp-sync: finish failed')
    }
    summary.processed++
  }
  return summary
}

// ---------------------------------------------------------------------------------------------------------
// Cron secret (D7)

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** Constant-time comparison (digests of equal length). Missing or empty values never match. */
export async function verifyCronSecret(header: string | null, expected: string | undefined): Promise<boolean> {
  if (!header || !expected) return false
  const [a, b] = await Promise.all([sha256(header), sha256(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 1)
  return diff === 0
}
