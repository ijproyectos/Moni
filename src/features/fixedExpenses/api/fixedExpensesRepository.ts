import { fromCents, toCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { getSupabase } from '@/shared/lib/supabase'
import {
  parseFixedExpenseOverview,
  type FixedExpenseOverview,
  type FixedPeriod,
  type FixedStatus,
} from '../domain/fixedExpense'

const toNumeric = (cents: Cents) => Number(fromCents(cents))

export interface FixedExpenseInput {
  kindId: string
  name: string
  amountCents: Cents
  period: FixedPeriod
  nextDueOn: IsoDate
  accountId: string
  categoryId: string
  remind: boolean
}

export interface DuplicateCandidate {
  id: string
  occurredOn: IsoDate
  note: string | null
  amountCents: Cents
}

/** Fixed expenses, pending bills, payments and history, all computed by the database for the caller. */
export async function getFixedExpenseOverview(): Promise<FixedExpenseOverview> {
  const { data, error } = await getSupabase().rpc('get_fixed_expense_overview')
  if (error) throw error
  return parseFixedExpenseOverview(data)
}

/** Turns the due dates that have arrived into pending bills. It never moves money. */
export async function processMyFixedExpenses(): Promise<number> {
  const { data, error } = await getSupabase().rpc('process_my_fixed_expenses')
  if (error) throw error
  return data ?? 0
}

export async function createFixedExpense(
  input: FixedExpenseInput,
  requestKey: string,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_fixed_expense', {
    p_kind: input.kindId,
    p_name: input.name,
    p_amount: toNumeric(input.amountCents),
    p_period: input.period,
    p_next_on: input.nextDueOn,
    p_account: input.accountId,
    p_category: input.categoryId,
    p_remind: input.remind,
    p_request_key: requestKey,
  })
  if (error) throw error
  return data
}

export async function updateFixedExpense(id: string, input: FixedExpenseInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_fixed_expense', {
    p_id: id,
    p_name: input.name,
    p_amount: toNumeric(input.amountCents),
    p_period: input.period,
    p_next_on: input.nextDueOn,
    p_account: input.accountId,
    p_category: input.categoryId,
    p_remind: input.remind,
  })
  if (error) throw error
}

export async function setFixedExpenseStatus(id: string, status: FixedStatus): Promise<void> {
  const { error } = await getSupabase().rpc('set_fixed_expense_status', {
    p_id: id,
    p_status: status,
  })
  if (error) throw error
}

/** "Registrar pago": creates the real expense (the only moment money moves). Retries with the same key are safe. */
export async function registerPayment(input: {
  occurrenceId: string
  amountCents: Cents
  paidOn: IsoDate
  accountId: string
  updateEstimate: boolean
  requestKey: string
}): Promise<string> {
  const { data, error } = await getSupabase().rpc('register_fixed_expense_payment', {
    p_occurrence: input.occurrenceId,
    p_amount: toNumeric(input.amountCents),
    p_paid_on: input.paidOn,
    p_account: input.accountId,
    p_update_estimate: input.updateEstimate,
    p_request_key: input.requestKey,
  })
  if (error) throw error
  return data
}

/** Expenses the person already typed that look like this payment (same account and amount, +-3 days). */
export async function findDuplicates(input: {
  occurrenceId: string
  amountCents: Cents
  paidOn: IsoDate
  accountId: string
}): Promise<DuplicateCandidate[]> {
  const { data, error } = await getSupabase().rpc('get_fixed_expense_duplicates', {
    p_occurrence: input.occurrenceId,
    p_amount: toNumeric(input.amountCents),
    p_paid_on: input.paidOn,
    p_account: input.accountId,
  })
  if (error) throw error
  const list = (data ?? []) as {
    id: string
    occurred_on: string
    note: string | null
    amount: number | string
  }[]
  return list.map((d) => ({
    id: d.id,
    occurredOn: d.occurred_on,
    note: d.note,
    amountCents: toCents(d.amount),
  }))
}

/** "Ya lo cargué": the bill is paid by the expense the person had typed; no new movement is created. */
export async function linkExistingExpense(
  occurrenceId: string,
  transactionId: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('link_fixed_expense_payment', {
    p_occurrence: occurrenceId,
    p_transaction: transactionId,
  })
  if (error) throw error
}

export async function skipOccurrence(occurrenceId: string): Promise<void> {
  const { error } = await getSupabase().rpc('skip_fixed_expense_occurrence', {
    p_occurrence: occurrenceId,
  })
  if (error) throw error
}

export async function rescheduleOccurrence(occurrenceId: string, newDate: IsoDate): Promise<void> {
  const { error } = await getSupabase().rpc('reschedule_fixed_expense_occurrence', {
    p_occurrence: occurrenceId,
    p_new_date: newDate,
  })
  if (error) throw error
}

/** Undo a payment: its movement is voided (or, if it was linked, only detached) and the bill is pending again. */
export async function voidPayment(paymentId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_fixed_expense_payment', { p_payment: paymentId })
  if (error) throw error
}

/** Fix the amount and/or payment date of a payment Moni registered: the same movement changes. */
export async function correctPayment(input: {
  paymentId: string
  amountCents: Cents
  paidOn: IsoDate
}): Promise<void> {
  const { error } = await getSupabase().rpc('correct_fixed_expense_payment', {
    p_payment: input.paymentId,
    p_amount: toNumeric(input.amountCents),
    p_paid_on: input.paidOn,
  })
  if (error) throw error
}
