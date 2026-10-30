import { formatDayMonth } from '@/shared/lib/dates'
import { billLabel } from './catalog'
import type { PendingBill } from './fixedExpense'

/** How a pending bill reads: overdue is said plainly. */
export function dueText(bill: PendingBill): string {
  const moved = bill.occurrence.rescheduledTo
    ? ` · vencía el ${formatDayMonth(bill.occurrence.dueOn)}`
    : ''
  if (bill.state === 'overdue') {
    const days = bill.daysLate
    return `Vencido hace ${days} ${days === 1 ? 'día' : 'días'} (${formatDayMonth(bill.date)})${moved}`
  }
  if (bill.state === 'today') return `Vence hoy${moved}`
  if (bill.state === 'tomorrow') return `Vence mañana${moved}`
  return `Vence el ${formatDayMonth(bill.date)}${moved}`
}

/** The question that goes with the due date: Moni does not pay, the person says what they paid. */
export function paymentQuestion(bill: PendingBill): string {
  const label = billLabel(bill.expense.kindId, bill.expense.name)
  if (bill.state === 'today') return `Hoy vence ${label}. ¿Cuánto pagaste?`
  if (bill.state === 'overdue') return `Venció el ${formatDayMonth(bill.date)}. ¿Cuánto pagaste?`
  return `Vence el ${formatDayMonth(bill.date)}. ¿Cuánto pagaste?`
}
