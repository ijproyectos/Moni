import { FunctionsHttpError } from '@supabase/supabase-js'
import { toCents } from '@/shared/lib/money'
import { assertOnline } from '@/shared/lib/offline'
import { envResult } from '@/shared/lib/env'
import { getSupabase } from '@/shared/lib/supabase'
import {
  MP_API_BASE_KEY,
  MP_CONSENT_VERSION,
  MP_PENDING_KEY,
  isMpAuthorizeUrl,
  parseConnection,
  parseDuplicates,
  parsePendingLink,
  safeApiBase,
  type ImportWindow,
  type MpConnection,
  type MpDuplicate,
  type MpSubscriptionSuggestion,
} from '../domain/mpImport'

/** Carries the `mp-oauth` error code ("plus_required", "rate_limited", ...) so `toUserMessage` can map it. */
export class MpImportError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'MpImportError'
  }
}

const GENERIC = 'mp_import_unavailable'

async function toMpImportError(error: unknown): Promise<MpImportError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await (error.context as Response).json()
      const code = (body as { error?: unknown } | null)?.error
      if (typeof code === 'string' && code !== '') return new MpImportError(code)
    } catch {
      // Body was not JSON: fall through.
    }
  }
  return new MpImportError(GENERIC)
}

/** Every action is a write: refused offline before any request, never queued. */
async function invokeAction(body: Record<string, unknown>): Promise<unknown> {
  assertOnline()
  const { data, error } = await getSupabase().functions.invoke('mp-oauth', { body })
  if (error) throw await toMpImportError(error)
  return data
}

/**
 * Leaves the Supabase API origin where public/mp/callback.html (a static page, no build step) can read it, so the page
 * works with a local stack or a custom auth domain. Public information, same-origin storage only.
 */
export function rememberApiBase(url: string | undefined = envResult.ok ? envResult.env.VITE_SUPABASE_URL : undefined) {
  const base = safeApiBase(url)
  if (!base) return
  try {
    window.localStorage.setItem(MP_API_BASE_KEY, base)
  } catch {
    // Storage blocked: the page falls back to the hosted project URL.
  }
}

/**
 * callback.html parks code/state here when its stored session had expired. The app (whose client refreshes the
 * session) finishes the exchange. Returns false when there was nothing (fresh) to finish. The pair is single use.
 */
export async function finishPendingLink(): Promise<boolean> {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(MP_PENDING_KEY)
    window.sessionStorage.removeItem(MP_PENDING_KEY)
  } catch {
    return false
  }
  const pending = parsePendingLink(raw, Date.now())
  if (!pending) return false
  assertOnline()
  const { error } = await getSupabase().functions.invoke('mp-oauth-callback', { body: pending })
  if (error) throw await toMpImportError(error)
  return true
}

/**
 * Asks the server for the Mercado Pago authorize URL. The consent version travels with the explicit acceptance (the
 * UI only calls this after the checkbox); the server re-checks both and the Plus entitlement.
 */
export async function connectMp(window: ImportWindow): Promise<string> {
  const data = await invokeAction({
    action: 'start',
    accepted: true,
    consent_version: MP_CONSENT_VERSION,
    import_window: window,
  })
  const url = (data as { url?: unknown } | null)?.url
  if (!isMpAuthorizeUrl(url)) throw new MpImportError(GENERIC)
  rememberApiBase()
  return url
}

/** Unlinking keeps every imported movement; only the connection goes away. */
export async function unlinkMp(): Promise<void> {
  await invokeAction({ action: 'unlink' })
}

/** "Sincronizar ahora": the server answers 202 and syncs in the background; 429 means "too soon". */
export async function syncNow(): Promise<void> {
  await invokeAction({ action: 'sync' })
}

export async function getConnection(): Promise<MpConnection | null> {
  const { data, error } = await getSupabase().rpc('get_my_mp_connection')
  if (error) throw error
  return parseConnection(data)
}

export async function getDuplicates(): Promise<MpDuplicate[]> {
  const { data, error } = await getSupabase().rpc('get_mp_import_duplicates')
  if (error) throw error
  return parseDuplicates(data)
}

/** Payments the import gave up on after repeated failures: stored as needs_review with no movement. Own rows only (RLS). */
export async function getUnimportedCount(): Promise<number> {
  const { count, error } = await getSupabase()
    .from('mp_imported_payments')
    .select('payment_id', { count: 'exact', head: true })
    .eq('outcome', 'needs_review')
    .is('transaction_id', null)
  if (error) throw error
  return count ?? 0
}

export async function dismissDuplicate(paymentId: string): Promise<void> {
  assertOnline()
  const { error } = await getSupabase().rpc('dismiss_mp_import_duplicate', {
    p_payment_id: paymentId,
  })
  if (error) throw error
}

/**
 * Recurring payments that matched one of the person's subscriptions were NOT loaded as expenses (R2.7). The owner can
 * read those rows through RLS; the subscription name is looked up in a second query. Display only (open question b).
 */
export async function getSubscriptionSuggestions(): Promise<MpSubscriptionSuggestion[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('mp_imported_payments')
    .select('payment_id, merchant, occurred_on, amount, suggested_subscription_id')
    .eq('outcome', 'skipped_subscription')
    .order('occurred_on', { ascending: false })
    .limit(10)
  if (error) throw error
  const rows = data ?? []
  const ids = [
    ...new Set(rows.map((r) => r.suggested_subscription_id).filter((id): id is string => !!id)),
  ]
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const { data: subs, error: subsError } = await supabase
      .from('subscriptions')
      .select('id, name')
      .in('id', ids)
    if (subsError) throw subsError
    for (const s of subs ?? []) names.set(s.id, s.name)
  }
  return rows.map((r) => ({
    paymentId: r.payment_id,
    merchant: r.merchant,
    occurredOn: r.occurred_on,
    cents: toCents(r.amount),
    subscriptionName: r.suggested_subscription_id
      ? (names.get(r.suggested_subscription_id) ?? null)
      : null,
  }))
}
