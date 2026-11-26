// Orchestration of "Eliminar cuenta" with every side effect injected (no Deno / npm imports), so Vitest runs it from Node with fakes.
// index.ts wires the real Supabase and Mercado Pago clients.
//
// Order matters and nothing is half done:
//   1. the confirmation word,
//   2. a subscription of a store (App Store / Google Play) cannot be cancelled from here: ask the person to do it there first,
//   3. the Mercado Pago subscription is cancelled; if it cannot be, NOTHING is deleted (so no charge can follow a deleted account)
//      and the person can retry,
//   4. one database transaction deletes the account and the personal data and anonymizes what is shared (public.delete_account),
//   5. the group photos that stayed orphaned are removed from Storage.
// A retry after any failure is safe: every step is idempotent.
//
// Logs carry only error codes and HTTP statuses, never ids, names, tokens or Mercado Pago bodies.

export const CONFIRMATION_WORD = 'ELIMINAR'

export interface SubscriptionRow {
  id: string
  preapproval_id: string | null
  status: string
}

export interface StoredFile {
  bucket: string
  name: string
}

interface DbError {
  code?: string
  message?: string
}

export interface DeleteDeps {
  listSubscriptions: (userId: string) => Promise<{ data: SubscriptionRow[] | null; error: DbError | null }>
  /** True while the person's Plus comes from App Store / Google Play (RevenueCat) and is still running. */
  storeSubscriptionActive: (userId: string) => Promise<boolean>
  /** Cancels one Mercado Pago preapproval. status 0 = network error or timeout. */
  cancelMp: (preapprovalId: string) => Promise<{ status: number }>
  /** public.delete_account: one transaction, idempotent. Returns the Storage paths left orphaned. */
  deleteAccount: (userId: string) => Promise<{ data: { status: string; storage: StoredFile[] } | null; error: DbError | null }>
  removeStorage: (files: StoredFile[]) => Promise<boolean>
  log: (message: string, detail?: string | number) => void
}

export interface DeleteResult {
  http: number
  body: { ok: true } | { error: string }
}

/** Subscription states that can still charge. */
const LIVE = new Set(['pending', 'authorized', 'paused'])

/**
 * What a request body may say: ONLY the confirmation word. Any other field (a user id included) is ignored, so there is nothing in the
 * request to point the deletion at somebody else: the account deleted is always the one of the verified JWT.
 */
export function parseDeleteRequest(raw: string): { ok: true; confirmation: unknown } | { ok: false } {
  try {
    const body: unknown = JSON.parse(raw)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false }
    return { ok: true, confirmation: (body as Record<string, unknown>).confirmation }
  } catch {
    return { ok: false }
  }
}

export function isConfirmed(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === CONFIRMATION_WORD
}

export async function runDeleteAccount(
  deps: DeleteDeps,
  input: { userId: string; confirmation: unknown },
): Promise<DeleteResult> {
  if (!isConfirmed(input.confirmation)) return { http: 400, body: { error: 'invalid_confirmation' } }

  if (await deps.storeSubscriptionActive(input.userId)) {
    return { http: 409, body: { error: 'store_subscription_active' } }
  }

  const rows = await deps.listSubscriptions(input.userId)
  if (rows.error) {
    deps.log('could not read the subscriptions', rows.error.code)
    return { http: 500, body: { error: 'deletion_failed' } }
  }
  for (const row of rows.data ?? []) {
    if (!LIVE.has(row.status) || !row.preapproval_id) continue
    const result = await deps.cancelMp(row.preapproval_id)
    // 404: Mercado Pago no longer knows it, so nothing can be charged.
    const done = (result.status >= 200 && result.status < 300) || result.status === 404
    if (!done) {
      deps.log('subscription could not be cancelled', result.status)
      return { http: 502, body: { error: 'subscription_cancel_failed' } }
    }
  }

  const deleted = await deps.deleteAccount(input.userId)
  if (deleted.error || !deleted.data) {
    deps.log('database deletion failed', deleted.error?.code)
    return { http: 500, body: { error: 'deletion_failed' } }
  }

  if (deleted.data.storage.length > 0) {
    const ok = await deps.removeStorage(deleted.data.storage)
    // The account is already gone and those files are unreachable (their group no longer exists): a failure here is only logged.
    if (!ok) deps.log('orphan files could not be removed', deleted.data.storage.length)
  }
  return { http: 200, body: { ok: true } }
}
