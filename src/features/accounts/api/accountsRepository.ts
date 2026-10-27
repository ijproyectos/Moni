import type { Account as AccountRow } from '@/shared/lib/database.types'
import { getSupabase } from '@/shared/lib/supabase'
import { fromCents, toCents } from '@/shared/lib/money'
import type { Account, AccountFormValues } from '../domain/account'

function toAccount(row: AccountRow, balance: number): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    openingBalanceCents: toCents(row.opening_balance),
    balanceCents: toCents(balance),
    archivedAt: row.archived_at,
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

export async function createAccount(values: AccountFormValues): Promise<void> {
  const { error } = await getSupabase()
    .from('accounts')
    .insert({
      name: values.name,
      kind: values.kind,
      opening_balance: Number(fromCents(values.openingBalance)),
    })
  if (error) throw error
}

export async function updateAccount(id: string, values: AccountFormValues): Promise<void> {
  const { error } = await getSupabase()
    .from('accounts')
    .update({
      name: values.name,
      kind: values.kind,
      opening_balance: Number(fromCents(values.openingBalance)),
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
