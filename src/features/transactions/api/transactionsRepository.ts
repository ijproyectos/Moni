import type {
  Transaction as TransactionRow,
  Transfer as TransferRow,
} from '@/shared/lib/database.types'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import type {
  Transaction,
  TransactionFormValues,
  Transfer,
  TransferFormValues,
} from '../domain/transaction'
import type { TransactionQueryFilters } from './queryKeys'

const toNumeric = (cents: number) => Number(fromCents(cents))

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
    kind: row.kind,
    amountCents: toCents(row.amount),
    occurredOn: row.occurred_on,
    note: row.note,
    status: row.status,
    voidedAt: row.voided_at,
    sharedExpenseId: row.shared_expense_id,
    createdAt: row.created_at,
  }
}

function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amountCents: toCents(row.amount),
    occurredOn: row.occurred_on,
    note: row.note,
    status: row.status,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
  }
}

/** Posted movements, newest first. Voided rows are only returned when asked for. */
export async function listTransactions(
  filters: TransactionQueryFilters,
  includeVoided = false,
): Promise<Transaction[]> {
  let query = getSupabase()
    .from('transactions')
    .select('*')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (!includeVoided) query = query.eq('status', 'posted')
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.accountId) query = query.eq('account_id', filters.accountId)
  if (filters.categoryIds?.length) query = query.in('category_id', [...filters.categoryIds])
  if (filters.from) query = query.gte('occurred_on', filters.from)
  if (filters.to) query = query.lte('occurred_on', filters.to)

  const { data, error } = await query
  if (error) throw error
  return data.map(toTransaction)
}

export async function createTransaction(values: TransactionFormValues): Promise<void> {
  const { error } = await getSupabase()
    .from('transactions')
    .insert({
      account_id: values.accountId,
      category_id: values.categoryId,
      kind: values.kind,
      amount: toNumeric(values.amount),
      occurred_on: values.occurredOn,
      note: values.note,
    })
  if (error) throw error
}

/** In-place edit. The kind cannot change: switch by voiding and creating a new movement. */
export async function updateTransaction(
  id: string,
  values: Omit<TransactionFormValues, 'kind'>,
): Promise<void> {
  const { error } = await getSupabase()
    .from('transactions')
    .update({
      account_id: values.accountId,
      category_id: values.categoryId,
      amount: toNumeric(values.amount),
      occurred_on: values.occurredOn,
      note: values.note,
    })
    .eq('id', id)
  if (error) throw error
}

export async function voidTransaction(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('transactions')
    .update({ status: 'voided' })
    .eq('id', id)
  if (error) throw error
}

export async function listTransfers(range: { from?: string; to?: string }): Promise<Transfer[]> {
  let query = getSupabase()
    .from('transfers')
    .select('*')
    .eq('status', 'posted')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (range.from) query = query.gte('occurred_on', range.from)
  if (range.to) query = query.lte('occurred_on', range.to)

  const { data, error } = await query
  if (error) throw error
  return data.map(toTransfer)
}

export async function createTransfer(values: TransferFormValues): Promise<void> {
  const { error } = await getSupabase()
    .from('transfers')
    .insert({
      from_account_id: values.fromAccountId,
      to_account_id: values.toAccountId,
      amount: toNumeric(values.amount),
      occurred_on: values.occurredOn,
      note: values.note,
    })
  if (error) throw error
}

export async function voidTransfer(id: string): Promise<void> {
  const { error } = await getSupabase().from('transfers').update({ status: 'voided' }).eq('id', id)
  if (error) throw error
}
