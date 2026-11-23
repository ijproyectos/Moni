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

/** The keys of the events (the ones calculated from live data) that the person already read. */
export async function listCenterReads(): Promise<string[]> {
  const { data, error } = await getSupabase().from('notice_reads').select('key')
  if (error) throw error
  return (data as { key: string }[]).map((r) => r.key)
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
