import type {
  Transaction as TransactionRow,
  Transfer as TransferRow,
} from '@/shared/lib/database.types'
import { fromCents, toCents, type Cents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import type {
  EntryKind,
  Transaction,
  TransactionFormValues,
  Transfer,
  TransferFormValues,
} from '../domain/transaction'
import type { TransactionQueryFilters } from './queryKeys'

const toNumeric = (cents: number) => Number(fromCents(cents))

type GroupEmbed = { group_id: string } | null

export function toTransaction(
  row: TransactionRow & { shared_expense?: GroupEmbed; settlement?: GroupEmbed },
): Transaction {
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
    groupId: row.shared_expense?.group_id ?? row.settlement?.group_id ?? null,
    guestExpenseId: row.guest_expense_id ?? null,
    statementClosingOn: row.statement_closing_on ?? null,
    installmentPlanId: row.installment_plan_id ?? null,
    installmentNumber: row.installment_number ?? null,
    installmentsTotal: row.installments_total ?? null,
    tripId: row.trip_id ?? null,
    tripCategory: row.trip_category ?? null,
    bookingId: row.booking_id ?? null,
    funding: row.funding ?? null,
    originalAmountCents: row.original_amount == null ? null : toCents(row.original_amount),
    originalCurrency: row.original_currency ?? null,
    tripAmountCents: row.trip_amount == null ? null : toCents(row.trip_amount),
    tripFxRate: row.trip_fx_rate == null ? null : Number(row.trip_fx_rate),
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
    .select('*, shared_expense:shared_expenses(group_id), settlement:settlements(group_id)')
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
  // The generated types do not know the group relations of these two links; the shape is the one declared above.
  return (data as unknown as Parameters<typeof toTransaction>[0][]).map(toTransaction)
}

/** A new movement; an expense may also belong to one of the person's trips (`tripId`). */
export type NewTransaction = TransactionFormValues & { tripId?: string | null }

/** What the database says about the row it just created: enough to undo it later (and its installment plan). */
export interface CreatedTransaction {
  id: string
  installmentPlanId: string | null
}

export async function createTransaction(values: NewTransaction): Promise<CreatedTransaction | null> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .insert({
      account_id: values.accountId,
      category_id: values.categoryId,
      kind: values.kind,
      amount: toNumeric(values.amount),
      occurred_on: values.occurredOn,
      note: values.note,
      // Only sent when set, so everything else keeps working on a database without trips.
      ...(values.tripId ? { trip_id: values.tripId } : {}),
    })
    .select('id, installment_plan_id')
    .single()
  if (error) throw error
  return data ? { id: data.id, installmentPlanId: data.installment_plan_id ?? null } : null
}

/** A row parsed from an imported spreadsheet. Bypasses `transactionFormSchema` (a zod form schema is the wrong tool
 * for rows already validated by `parseMovementRows`), but keeps the same database rule: a check constraint on
 * `transactions` requires `category_id` whenever `kind` is 'expense' or 'income'. */
export interface ImportedTransaction {
  accountId: string
  categoryId: string
  kind: EntryKind
  amountCents: Cents
  occurredOn: string
  note: string | null
}

export async function createImportedTransaction(values: ImportedTransaction): Promise<void> {
  const { error } = await getSupabase().from('transactions').insert({
    account_id: values.accountId,
    category_id: values.categoryId,
    kind: values.kind,
    amount: toNumeric(values.amountCents),
    occurred_on: values.occurredOn,
    note: values.note,
  })
  if (error) throw error
}

/** In-place edit. The kind cannot change: switch by voiding and creating a new movement. */
export async function updateTransaction(
  id: string,
  values: Omit<TransactionFormValues, 'kind'>,
  /** Trip the expense belongs to: a trip id links it, null unlinks it, undefined leaves it as it is. */
  tripId?: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from('transactions')
    .update({
      account_id: values.accountId,
      category_id: values.categoryId,
      amount: toNumeric(values.amount),
      occurred_on: values.occurredOn,
      note: values.note,
      // Only sent when it changes: linking is an UPDATE of the same movement (no copy, no new charge).
      ...(tripId !== undefined ? { trip_id: tripId } : {}),
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
