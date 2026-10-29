import type { Account as AccountRow } from '@/shared/lib/database.types'
import { getSupabase } from '@/shared/lib/supabase'
import { fromCents, toCents } from '@/shared/lib/money'
import type { Account, AccountFormValues } from '../domain/account'
import type { Cents } from '@/shared/lib/money'

function toAccount(row: AccountRow, balance: number): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    openingBalanceCents: toCents(row.opening_balance),
    balanceCents: toCents(balance),
    archivedAt: row.archived_at,
    creditLimitCents: row.credit_limit == null ? null : toCents(row.credit_limit),
    closingDay: row.closing_day ?? null,
    dueDay: row.due_day ?? null,
  }
}

/** Accounts with their derived balances, oldest first. */
export async function listAccounts(includeArchived: boolean): Promise<Account[]> {
  const supabase = getSupabase()
  let query = supabase.from('accounts').select('*').order('created_at', { ascending: true })
  if (!includeArchived) query = query.is('archived_at', null)

  const [accounts, balances] = await Promise.all([
    query,
    supabase.from('account_balances').select('account_id, balance'),
  ])
  if (accounts.error) throw accounts.error
  if (balances.error) throw balances.error

  const balanceById = new Map(balances.data.map((row) => [row.account_id, row.balance]))
  return accounts.data.map((row) => toAccount(row, balanceById.get(row.id) ?? row.opening_balance))
}

/** A card's opening balance is its starting debt, stored as a negative number. */
const storedOpening = (values: AccountFormValues) =>
  Number(fromCents(values.kind === 'credit_card' ? -values.openingBalance : values.openingBalance))

/** Card settings go in the payload only for cards (or when leaving the card kind), so other accounts never touch those columns. */
function cardSettings(values: AccountFormValues) {
  return {
    credit_limit: values.creditLimit === null ? null : Number(fromCents(values.creditLimit)),
    closing_day: values.closingDay,
    due_day: values.dueDay,
  }
}

export async function createAccount(values: AccountFormValues): Promise<void> {
  const { error } = await getSupabase()
    .from('accounts')
    .insert({
      name: values.name,
      kind: values.kind,
      opening_balance: storedOpening(values),
      ...(values.kind === 'credit_card' ? cardSettings(values) : {}),
    })
  if (error) throw error
}

export async function updateAccount(
  id: string,
  values: AccountFormValues,
  previousKind?: Account['kind'],
): Promise<void> {
  const touchesCard = values.kind === 'credit_card' || previousKind === 'credit_card'
  const { error } = await getSupabase()
    .from('accounts')
    .update({
      name: values.name,
      kind: values.kind,
      opening_balance: storedOpening(values),
      ...(touchesCard ? cardSettings(values) : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function setAccountArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('accounts')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

/**
 * Sets the account to the balance the person really has. The database records only the difference as
 * an adjustment (not income, not expense) and writes nothing when it already matches.
 * Returns the difference in cents.
 */
export async function adjustAccountBalance(
  accountId: string,
  targetCents: Cents,
  note?: string,
): Promise<Cents> {
  const { data, error } = await getSupabase().rpc('adjust_account_balance', {
    p_account: accountId,
    p_target: Number(fromCents(targetCents)),
    p_note: note?.trim() ? note.trim() : null,
  })
  if (error) throw error
  return toCents(data ?? 0)
}
