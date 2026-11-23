import { getSupabase } from '@/shared/lib/supabase'

/** What the notice center shows (saved in Supabase, one row per person). All on until the person turns one off. */
export interface CenterPrefs {
  expenseAddedPush: boolean
  paymentsDue: boolean
  priceChanges: boolean
  budgets: boolean
}

export const DEFAULT_CENTER_PREFS: CenterPrefs = { expenseAddedPush: true, paymentsDue: true, priceChanges: true, budgets: true }

/** PostgREST / Postgres answer these when the notices migration has not been applied yet. */
export function isCenterNotEnabled(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01'
}

/** What the person already read and what they deleted, by key (derived events have no row of their own). */
export interface CenterReads {
  read: string[]
  dismissed: string[]
}

export async function listCenterReads(): Promise<CenterReads> {
  const full = await getSupabase().from('notice_reads').select('key, dismissed_at')
  if (!full.error) {
    const rows = full.data as { key: string; dismissed_at: string | null }[]
    return { read: rows.map((r) => r.key), dismissed: rows.filter((r) => r.dismissed_at).map((r) => r.key) }
  }
  // The cleanup migration is not there yet: the column does not exist, reads still work.
  const { data, error } = await getSupabase().from('notice_reads').select('key')
  if (error) throw error
  return { read: (data as { key: string }[]).map((r) => r.key), dismissed: [] }
}

/** Deletes the person's own notices (`null` = all of them). Notices still waiting for an answer are kept: the number deleted comes back. */
export async function deleteNotices(ids: readonly string[] | null): Promise<number> {
  const { data, error } = await getSupabase().rpc('delete_my_notices', { p_ids: ids === null ? null : [...ids] })
  if (error) throw error
  return Number(data ?? 0)
}

/** Hides events calculated from live data (they have no row to delete): the key is remembered so they do not come back. */
export async function dismissCenterEvents(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  const { error } = await getSupabase().rpc('dismiss_center_notices', { p_keys: [...keys] })
  if (error) throw error
}

/** Old notices (over 7 days) are removed, except the ones that still need an answer. Best effort: never blocks the screen. */
export async function purgeOldNotices(): Promise<void> {
  const { error } = await getSupabase().rpc('purge_old_notices')
  if (error && !isCenterNotEnabled(error)) throw error
}

export async function markCenterRead(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return
  const { error } = await getSupabase().rpc('mark_center_notices_read', { p_keys: [...keys] })
  if (error) throw error
}

/** Marks ONE notice of a group as read (the person's own row: RLS and the column grant allow only read_at). */
export async function markNoticeRead(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw error
}

export async function getCenterPrefs(): Promise<CenterPrefs> {
  const { data, error } = await getSupabase().rpc('get_my_notice_prefs_extra')
  if (error) throw error
  const row = data?.[0]
  return row
    ? {
        expenseAddedPush: row.expense_added_push,
        paymentsDue: row.center_payments_due,
        priceChanges: row.center_price_changes,
        budgets: row.center_budgets,
      }
    : DEFAULT_CENTER_PREFS
}

export async function setCenterPrefs(prefs: CenterPrefs): Promise<void> {
  const { error } = await getSupabase().rpc('set_notice_prefs_extra', {
    p_expense_added_push: prefs.expenseAddedPush,
    p_center_payments_due: prefs.paymentsDue,
    p_center_price_changes: prefs.priceChanges,
    p_center_budgets: prefs.budgets,
  })
  if (error) throw error
}
