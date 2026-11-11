import { formatDayMonth } from '@/shared/lib/dates'
import type { Cents } from '@/shared/lib/money'
import { monthRange, type IsoDate } from '@/shared/lib/month'
import {
  daysBetween,
  isEffectivePayment,
  pendingBills,
  splitPendingBills,
  upcomingExpenses,
  type FixedExpense,
  type FixedExpenseOverview,
  type PendingBill,
} from './fixedExpense'

export type DebitStatus = 'paid' | 'overdue' | 'today' | 'soon' | 'later'

/** How many days ahead a debit still reads "En N días" (further away it shows its date). */
const SOON_DAYS = 7

export interface MonthDebitRow {
  key: string
  expense: FixedExpense
  date: IsoDate
  accountName: string
  amountCents: Cents
  status: DebitStatus
  /** Days from today to the date (negative when late). */
  daysAway: number
  /** Set while the bill still waits for a decision: it can be paid, moved or skipped. */
  bill: PendingBill | null
}

export interface MonthDebits {
  rows: MonthDebitRow[]
  /** What was really paid this month. */
  paidCents: Cents
  /** What is still to be debited this month (estimates, plus anything overdue). */
  pendingCents: Cents
  totalCents: Cents
  /** The first debit that has not happened yet, from today on. */
  next: MonthDebitRow | null
  /** Active expenses whose next due date falls after this month. */
  later: FixedExpense[]
}

function statusOf(daysAway: number): DebitStatus {
  if (daysAway < 0) return 'overdue'
  if (daysAway === 0) return 'today'
  return daysAway <= SOON_DAYS ? 'soon' : 'later'
}

/** The fixed expenses of the month that contains today: paid ones, bills waiting and due dates still to come. */
export function monthDebits(overview: FixedExpenseOverview): MonthDebits {
  const { today } = overview
  const { to: monthEnd } = monthRange(today)
  const prefix = today.slice(0, 7)
  const byId = new Map(overview.expenses.map((e) => [e.id, e]))
  const rows: MonthDebitRow[] = []

  for (const payment of overview.payments) {
    const expense = byId.get(payment.fixedExpenseId)
    if (!expense || !isEffectivePayment(payment) || !payment.paidOn.startsWith(prefix)) continue
    rows.push({
      key: `payment-${payment.id}`,
      expense,
      date: payment.paidOn,
      accountName: payment.accountName,
      amountCents: payment.amountCents,
      status: 'paid',
      daysAway: daysBetween(today, payment.paidOn),
      bill: null,
    })
  }
  for (const bill of splitPendingBills(pendingBills(overview)).active) {
    if (bill.date > monthEnd) continue
    const daysAway = daysBetween(today, bill.date)
    rows.push({
      key: `bill-${bill.occurrence.id}`,
      expense: bill.expense,
      date: bill.date,
      accountName: bill.expense.accountName,
      amountCents: bill.occurrence.expectedCents,
      status: statusOf(daysAway),
      daysAway,
      bill,
    })
  }
  const later: FixedExpense[] = []
  for (const expense of upcomingExpenses(overview.expenses)) {
    if (expense.nextDueOn > monthEnd) {
      later.push(expense)
      continue
    }
    const daysAway = daysBetween(today, expense.nextDueOn)
    rows.push({
      key: `upcoming-${expense.id}`,
      expense,
      date: expense.nextDueOn,
      accountName: expense.accountName,
      amountCents: expense.amountCents,
      status: statusOf(daysAway),
      daysAway,
      bill: null,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.expense.name.localeCompare(b.expense.name))

  const paidCents = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amountCents, 0)
  const pendingCents = rows.filter((r) => r.status !== 'paid').reduce((s, r) => s + r.amountCents, 0)
  const next = rows.find((r) => r.status !== 'paid' && r.status !== 'overdue') ?? null
  return { rows, paidCents, pendingCents, totalCents: paidCents + pendingCents, next, later }
}

const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' })

/** "El viernes se debita Personal Flow." Only says what is known: the date and the name. */
export function nextDebitText(row: MonthDebitRow): string {
  if (row.status === 'today') return `Hoy se debita ${row.expense.name}.`
  if (row.daysAway === 1) return `Mañana se debita ${row.expense.name}.`
  const [y, m, d] = row.date.split('-').map(Number) as [number, number, number]
  return row.status === 'soon'
    ? `El ${weekday.format(new Date(Date.UTC(y, m - 1, d)))} se debita ${row.expense.name}.`
    : `El ${formatDayMonth(row.date)} se debita ${row.expense.name}.`
}

/** Right-hand text of a row: "En 5 días", "Vence hoy", "Vencido hace 3 días" or the date. */
export function debitStatusText(row: MonthDebitRow): string {
  switch (row.status) {
    case 'paid':
      return 'Pagado'
    case 'overdue':
      return `Vencido hace ${-row.daysAway} ${row.daysAway === -1 ? 'día' : 'días'}`
    case 'today':
      return 'Vence hoy'
    case 'soon':
      return row.daysAway === 1 ? 'Mañana' : `En ${row.daysAway} días`
    case 'later':
      return formatDayMonth(row.date)
  }
}
