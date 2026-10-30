import { z } from 'zod'
import { formatArs, toCents, type Cents } from '@/shared/lib/money'
import { addDays, type IsoDate } from '@/shared/lib/month'
import type { AccountKind } from '@/shared/lib/database.types'
import { billLabel } from './catalog'

export type FixedStatus = 'active' | 'paused' | 'removed'
export type FixedPeriod = 'monthly' | 'bimonthly' | 'yearly'
export type OccurrenceStatus = 'pending' | 'paid' | 'skipped'
export type PaymentStatus = 'posted' | 'voided'

export const PERIOD_LABELS: Record<FixedPeriod, string> = {
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  yearly: 'Anual',
}

export interface FixedExpense {
  id: string
  kindId: string
  name: string
  /** Estimated amount: it can change every month and is never charged by itself. */
  amountCents: Cents
  period: FixedPeriod
  /** Next due date that has not become a pending bill yet. */
  nextDueOn: IsoDate
  accountId: string
  accountName: string
  accountKind: AccountKind
  categoryId: string
  remind: boolean
  status: FixedStatus
}

export interface Occurrence {
  id: string
  fixedExpenseId: string
  /** Original due date: never changes. */
  dueOn: IsoDate
  /** Where the person moved it, if they did. */
  rescheduledTo: IsoDate | null
  expectedCents: Cents
  status: OccurrenceStatus
  note: string | null
}

export interface Payment {
  id: string
  occurrenceId: string
  fixedExpenseId: string
  source: 'registered' | 'linked'
  status: PaymentStatus
  /** Real amount paid (the movement's current amount). */
  amountCents: Cents
  /** Day it was really paid: separate from the due date. */
  paidOn: IsoDate
  accountId: string
  accountName: string
  transactionId: string
  /** The movement was voided from Movimientos while the payment still counted. */
  voidedElsewhere: boolean
}

export interface FixedExpenseOverview {
  today: IsoDate
  expenses: FixedExpense[]
  occurrences: Occurrence[]
  payments: Payment[]
}

const money = z.union([z.number(), z.string()]).transform((v) => toCents(v))

const rawSchema = z.object({
  today: z.string(),
  expenses: z.array(
    z.object({
      id: z.string(),
      kind_id: z.string(),
      name: z.string(),
      amount: money,
      period: z.enum(['monthly', 'bimonthly', 'yearly']),
      next_due_on: z.string(),
      account_id: z.string(),
      account_name: z.string(),
      account_kind: z.enum(['cash', 'bank', 'wallet', 'credit_card']),
      category_id: z.string(),
      remind: z.boolean(),
      status: z.enum(['active', 'paused', 'removed']),
    }),
  ),
  occurrences: z.array(
    z.object({
      id: z.string(),
      fixed_expense_id: z.string(),
      due_on: z.string(),
      rescheduled_to: z.string().nullable(),
      expected_amount: money,
      status: z.enum(['pending', 'paid', 'skipped']),
      note: z.string().nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      occurrence_id: z.string(),
      fixed_expense_id: z.string(),
      source: z.enum(['registered', 'linked']),
      status: z.enum(['posted', 'voided']),
      amount: money,
      paid_on: z.string(),
      account_id: z.string(),
      account_name: z.string(),
      transaction_id: z.string(),
      voided_elsewhere: z.boolean().nullable(),
    }),
  ),
})

/** Validates and converts what public.get_fixed_expense_overview returns (amounts become cents). */
export function parseFixedExpenseOverview(raw: unknown): FixedExpenseOverview {
  const data = rawSchema.parse(raw)
  return {
    today: data.today,
    expenses: data.expenses.map((e) => ({
      id: e.id,
      kindId: e.kind_id,
      name: e.name,
      amountCents: e.amount,
      period: e.period,
      nextDueOn: e.next_due_on,
      accountId: e.account_id,
      accountName: e.account_name,
      accountKind: e.account_kind,
      categoryId: e.category_id,
      remind: e.remind,
      status: e.status,
    })),
    occurrences: data.occurrences.map((o) => ({
      id: o.id,
      fixedExpenseId: o.fixed_expense_id,
      dueOn: o.due_on,
      rescheduledTo: o.rescheduled_to,
      expectedCents: o.expected_amount,
      status: o.status,
      note: o.note,
    })),
    payments: data.payments.map((p) => ({
      id: p.id,
      occurrenceId: p.occurrence_id,
      fixedExpenseId: p.fixed_expense_id,
      source: p.source,
      status: p.status,
      amountCents: p.amount,
      paidOn: p.paid_on,
      accountId: p.account_id,
      accountName: p.account_name,
      transactionId: p.transaction_id,
      voidedElsewhere: p.voided_elsewhere ?? false,
    })),
  }
}

/** The date a pending bill counts for: where the person moved it, or its original due date. */
export function effectiveDate(occurrence: Pick<Occurrence, 'dueOn' | 'rescheduledTo'>): IsoDate {
  return occurrence.rescheduledTo ?? occurrence.dueOn
}

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'later'

/** How close a date is: overdue (past), today, tomorrow or later. */
export function dueState(date: IsoDate, today: IsoDate): DueState {
  if (date < today) return 'overdue'
  if (date === today) return 'today'
  if (date === addDays(today, 1)) return 'tomorrow'
  return 'later'
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = (d: IsoDate) =>
    Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.round((ms(b) - ms(a)) / 86_400_000)
}

/** Estimated cost per month of the active fixed expenses (bimonthly / 2, yearly / 12), in whole pesos. */
export function monthlyEstimateCents(expenses: readonly FixedExpense[]): Cents {
  const total = expenses
    .filter((e) => e.status === 'active')
    .reduce(
      (sum, e) =>
        sum +
        (e.period === 'yearly'
          ? e.amountCents / 12
          : e.period === 'bimonthly'
            ? e.amountCents / 2
            : e.amountCents),
      0,
    )
  return Math.round(total / 100) * 100
}

/** A payment that counts as money spent: standing, with its movement still posted. */
export function isEffectivePayment(payment: Payment): boolean {
  return payment.status === 'posted' && !payment.voidedElsewhere
}

/** What was really paid in the month that contains `today` (by payment date, not due date). */
export function paidInMonthCents(payments: readonly Payment[], today: IsoDate): Cents {
  const month = today.slice(0, 7)
  return payments
    .filter((p) => isEffectivePayment(p) && p.paidOn.slice(0, 7) === month)
    .reduce((sum, p) => sum + p.amountCents, 0)
}

export interface PendingBill {
  occurrence: Occurrence
  expense: FixedExpense
  date: IsoDate
  state: DueState
  /** Days past the date (overdue only). */
  daysLate: number
}

/** Bills waiting for a decision, most overdue first. */
export function pendingBills(overview: FixedExpenseOverview): PendingBill[] {
  const byId = new Map(overview.expenses.map((e) => [e.id, e]))
  return overview.occurrences
    .filter((o) => o.status === 'pending')
    .flatMap((occurrence) => {
      const expense = byId.get(occurrence.fixedExpenseId)
      if (!expense || expense.status === 'removed') return []
      const date = effectiveDate(occurrence)
      return [
        {
          occurrence,
          expense,
          date,
          state: dueState(date, overview.today),
          daysLate: Math.max(0, daysBetween(date, overview.today)),
        },
      ]
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.expense.name.localeCompare(b.expense.name))
}

/**
 * Pending bills of active expenses, and the older ones that belong to a PAUSED expense. A pause stops new due dates
 * but keeps what was already pending: it stays reachable (under Pausados), apart from the upcoming payments.
 */
export function splitPendingBills(bills: readonly PendingBill[]): {
  active: PendingBill[]
  paused: PendingBill[]
} {
  return {
    active: bills.filter((b) => b.expense.status !== 'paused'),
    paused: bills.filter((b) => b.expense.status === 'paused'),
  }
}

/** Active fixed expenses by their next due date (the ones that have not arrived yet). */
export function upcomingExpenses(expenses: readonly FixedExpense[]): FixedExpense[] {
  return expenses
    .filter((e) => e.status === 'active')
    .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn) || a.name.localeCompare(b.name))
}

export type HistoryItem =
  | { type: 'payment'; date: IsoDate; payment: Payment; expense: FixedExpense }
  | { type: 'skipped'; date: IsoDate; occurrence: Occurrence; expense: FixedExpense }

/** Payments (also voided ones) and skipped bills, newest first. */
export function historyItems(overview: FixedExpenseOverview, only?: string): HistoryItem[] {
  const byId = new Map(overview.expenses.map((e) => [e.id, e]))
  const items: HistoryItem[] = []
  for (const payment of overview.payments) {
    const expense = byId.get(payment.fixedExpenseId)
    if (expense && (!only || expense.id === only)) {
      items.push({ type: 'payment', date: payment.paidOn, payment, expense })
    }
  }
  for (const occurrence of overview.occurrences) {
    const expense = byId.get(occurrence.fixedExpenseId)
    if (occurrence.status === 'skipped' && expense && (!only || expense.id === only)) {
      items.push({ type: 'skipped', date: effectiveDate(occurrence), occurrence, expense })
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date))
}

export interface FixedReminder {
  key: string
  text: string
}

/**
 * "Hoy vence tu factura de luz. ¿Cuánto pagaste?" on the due day (and "Mañana vence…" the day before), for
 * pending bills and for ones whose date has not become a bill yet. Only expenses with reminders on.
 */
export function fixedReminders(overview: FixedExpenseOverview): FixedReminder[] {
  const { today } = overview
  const tomorrow = addDays(today, 1)
  const out: FixedReminder[] = []
  const line = (e: FixedExpense, date: IsoDate, expected: Cents, key: string) => {
    if (!e.remind) return
    if (date === today) {
      out.push({ key, text: `Hoy vence ${billLabel(e.kindId, e.name)}. ¿Cuánto pagaste?` })
    } else if (date === tomorrow) {
      out.push({
        key,
        text: `Mañana vence ${billLabel(e.kindId, e.name)}: aprox. ${formatArs(expected)}, se paga con ${e.accountName}`,
      })
    }
  }
  // A paused expense stops reminding (its older pending bills stay in the app, under Pausados).
  for (const bill of pendingBills(overview).filter((b) => b.expense.status !== 'paused')) {
    line(bill.expense, bill.date, bill.occurrence.expectedCents, `occ-${bill.occurrence.id}`)
  }
  for (const e of upcomingExpenses(overview.expenses)) {
    line(e, e.nextDueOn, e.amountCents, `exp-${e.id}-${e.nextDueOn}`)
  }
  return out
}
