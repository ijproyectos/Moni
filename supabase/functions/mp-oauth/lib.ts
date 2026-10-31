// Pure logic of the mp-oauth Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// The HTTP, Supabase and Mercado Pago wiring lives in index.ts.

/** Server-side consent text version (D19). The UI sends the same string; a mismatch means `consent_required`. */
export const MP_CONSENT_VERSION = 'mp-import-v1'
export const MAX_BODY_BYTES = 1024
/** Max `start` calls per user per hour. */
export const START_RATE_LIMIT = 10

export type ImportWindow = 'now' | '30' | '90'

/** Minimum gap between two manual syncs of the same user (R2.1). */
export const MANUAL_SYNC_GUARD_MS = 5 * 60 * 1000

export type ParsedRequest =
  | {
      ok: true
      action: 'start'
      accepted: boolean
      consentVersion: string
      importWindow: ImportWindow
    }
  | { ok: true; action: 'unlink' }
  | { ok: true; action: 'sync' }
  | { ok: false }

export function parseRequest(body: unknown): ParsedRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false }
  const b = body as Record<string, unknown>
  if (b.action === 'unlink') return { ok: true, action: 'unlink' }
  if (b.action === 'sync') return { ok: true, action: 'sync' }
  if (b.action !== 'start') return { ok: false }
  const window = b.import_window === undefined ? 'now' : b.import_window
  if (window !== 'now' && window !== '30' && window !== '90') return { ok: false }
  return {
    ok: true,
    action: 'start',
    accepted: b.accepted === true,
    consentVersion: typeof b.consent_version === 'string' ? b.consent_version.slice(0, 40) : '',
    importWindow: window,
  }
}

/** First-sync lower bound: link time for 'now', else that many days back. */
export function computeImportSince(window: ImportWindow, now: Date): Date {
  const days = window === 'now' ? 0 : Number(window)
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 32 random bytes, base64url. Only its sha256 is stored. */
export function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface HandlerResult {
  http: number
  body: Record<string, unknown>
}

// ---------------------------------------------------------------------------------------------------------
// start

export interface StartDeps {
  isPlus(userId: string): Promise<boolean>
  /** Number of states minted by the user in the last hour. */
  recentStateCount(userId: string): Promise<number>
  saveState(row: {
    userId: string
    stateHash: string
    importWindow: ImportWindow
    consentVersion: string
  }): Promise<void>
  randomState(): string
  authorizeUrl(state: string): string
}

export async function handleStart(
  deps: StartDeps,
  input: { userId: string; accepted: boolean; consentVersion: string; importWindow: ImportWindow },
): Promise<HandlerResult> {
  try {
    if (!(await deps.isPlus(input.userId))) return { http: 403, body: { error: 'plus_required' } }
    if (!input.accepted || input.consentVersion !== MP_CONSENT_VERSION) {
      return { http: 400, body: { error: 'consent_required' } }
    }
    if ((await deps.recentStateCount(input.userId)) >= START_RATE_LIMIT) {
      return { http: 429, body: { error: 'rate_limited' } }
    }
    const state = deps.randomState()
    await deps.saveState({
      userId: input.userId,
      stateHash: await sha256Hex(state),
      importWindow: input.importWindow,
      consentVersion: MP_CONSENT_VERSION,
    })
    return { http: 200, body: { url: deps.authorizeUrl(state) } }
  } catch {
    return { http: 500, body: { error: 'server_error' } }
  }
}

// ---------------------------------------------------------------------------------------------------------
// unlink

export type ConnectionStatus = 'active' | 'needs_reconnect' | 'plus_lapsed' | 'unlinked'

export interface UnlinkDeps {
  loadConnection(userId: string): Promise<{ status: ConnectionStatus } | null>
  /** Best effort: no revoke endpoint is documented (V4). Failures are swallowed. */
  revoke(userId: string): Promise<void>
  /** Nulls the ciphertexts and key_version, sets status 'unlinked'. Transactions are never touched. */
  markUnlinked(userId: string): Promise<void>
}

/** Unlink is allowed for ANY user holding a connection (no Plus check): lapsed users must be able to leave. */
export async function handleUnlink(deps: UnlinkDeps, input: { userId: string }): Promise<HandlerResult> {
  try {
    const conn = await deps.loadConnection(input.userId)
    if (!conn) return { http: 404, body: { error: 'not_connected' } }
    if (conn.status === 'unlinked') return { http: 200, body: { status: 'unlinked' } }
    try {
      await deps.revoke(input.userId)
    } catch {
      console.error('mp-oauth: best-effort revoke failed')
    }
    await deps.markUnlinked(input.userId)
    return { http: 200, body: { status: 'unlinked' } }
  } catch {
    return { http: 500, body: { error: 'server_error' } }
  }
}

// ---------------------------------------------------------------------------------------------------------
// sync (sync now)

export interface SyncActionDeps {
  loadConnection(userId: string): Promise<{ status: ConnectionStatus } | null>
  isPlus(userId: string): Promise<boolean>
  /**
   * Stamps the 5-minute guard (see claimManualSync below). `release` undoes the stamp when the sync could not start.
   * `guarded` = inside the window; `unavailable` = the connection is not active (any other reason for "0 rows").
   */
  claimManualSync(userId: string, cutoffIso: string): Promise<ManualSyncClaim>
  /** Starts the shared mp-sync core for this user only (fire and forget on the server side). */
  triggerSync(userId: string): Promise<void>
  now(): Date
}

export type ManualSyncClaim =
  | { status: 'claimed'; release(): Promise<void> }
  | { status: 'guarded' }
  | { status: 'unavailable' }

/** Storage behind the manual-sync guard (index.ts wires it to mp_connections.last_manual_sync_at). */
export interface ManualSyncStore {
  read(userId: string): Promise<{ status: string; lastManualSyncAt: string | null } | null>
  /** Atomic: stamps only when the column is null or older than the cutoff AND the status is active. */
  stampIfDue(userId: string, stampIso: string, cutoffIso: string): Promise<boolean>
  /** Puts `previous` back, only if the column still holds our stamp (a later run's stamp is never overwritten). */
  restore(userId: string, stampIso: string, previous: string | null): Promise<void>
}

/**
 * Takes the guard. Zero rows updated is NOT always the guard: a connection that stopped being active (unlinked,
 * needs_reconnect, lapsed) is reported as `unavailable`, so the person is not told to "wait 5 minutes" for nothing.
 */
export async function claimManualSync(
  store: ManualSyncStore,
  userId: string,
  now: Date,
  cutoffIso: string,
): Promise<ManualSyncClaim> {
  const before = await store.read(userId)
  if (!before || before.status !== 'active') return { status: 'unavailable' }
  const stamp = now.toISOString()
  if (await store.stampIfDue(userId, stamp, cutoffIso)) {
    return { status: 'claimed', release: () => store.restore(userId, stamp, before.lastManualSyncAt) }
  }
  const after = await store.read(userId)
  return !after || after.status !== 'active' ? { status: 'unavailable' } : { status: 'guarded' }
}

export async function handleSync(deps: SyncActionDeps, input: { userId: string }): Promise<HandlerResult> {
  try {
    const conn = await deps.loadConnection(input.userId)
    if (!conn || conn.status === 'unlinked') return { http: 404, body: { error: 'not_connected' } }
    if (conn.status === 'needs_reconnect') return { http: 409, body: { error: 'needs_reconnect' } }
    if (!(await deps.isPlus(input.userId))) return { http: 403, body: { error: 'plus_required' } }
    const cutoff = new Date(deps.now().getTime() - MANUAL_SYNC_GUARD_MS).toISOString()
    const claim = await deps.claimManualSync(input.userId, cutoff)
    if (claim.status === 'guarded') return { http: 429, body: { error: 'rate_limited' } }
    if (claim.status === 'unavailable') return { http: 409, body: { error: 'not_active' } }
    try {
      await deps.triggerSync(input.userId)
    } catch (error) {
      // The sync never started: give the guard back so the next tap is not blocked for 5 minutes.
      try {
        await claim.release()
      } catch {
        console.error('mp-oauth: guard release failed')
      }
      throw error
    }
    return { http: 202, body: { status: 'started' } }
  } catch {
    return { http: 500, body: { error: 'server_error' } }
  }
}
