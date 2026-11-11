import type { Cents } from '@/shared/lib/money'
import { daysInMonth, monthStart, shiftMonth, type IsoDate } from '@/shared/lib/month'
import { countsInStatistics, type EntryKind, type Transaction } from './transaction'

export interface MonthComparison {
  kind: EntryKind
  currentMonth: IsoDate
  previousMonth: IsoDate
  currentCents: Cents
  previousCents: Cents
  /** Whole-percent change versus the previous month; null when the previous month has nothing to compare to. */
  deltaPct: number | null
}

function sumUpTo(
  transactions: readonly Transaction[],
  kind: EntryKind,
  month: IsoDate,
  lastDay: number,
): Cents {
  const prefix = month.slice(0, 7)
  let total = 0
  for (const tx of transactions) {
    if (!countsInStatistics(tx) || tx.kind !== kind || !tx.occurredOn.startsWith(prefix)) continue
    if (Number(tx.occurredOn.slice(8, 10)) <= lastDay) total += tx.amountCents
  }
  return total
}

/**
 * One month against the previous one up to the same day of the month (so a month in progress is compared fairly).
 * A finished month is compared whole.
 */
export function compareMonths(
  transactions: readonly Transaction[],
  kind: EntryKind,
  month: IsoDate,
  today: IsoDate,
): MonthComparison {
  const currentMonth = monthStart(month)
  const previousMonth = shiftMonth(currentMonth, -1)
  const lastDay =
    currentMonth === monthStart(today) ? Number(today.slice(8, 10)) : daysInMonth(currentMonth)
  const currentCents = sumUpTo(transactions, kind, currentMonth, lastDay)
  const previousCents = sumUpTo(
    transactions,
    kind,
    previousMonth,
    Math.min(lastDay, daysInMonth(previousMonth)),
  )
  const deltaPct =
    previousCents > 0 ? Math.round(((currentCents - previousCents) / previousCents) * 100) : null
  return { kind, currentMonth, previousMonth, currentCents, previousCents, deltaPct }
}
