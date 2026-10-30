import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import type { DailyTotal } from './monthSummary'

export interface MonthlyIncome {
  /** First day of the month, "YYYY-MM-01". */
  month: IsoDate
  incomeCents: Cents
}

/**
 * Income of each of the 12 months of `year` from the daily totals of get_period_summary. That RPC
 * already counts only genuine income (kind 'income'): no opening balances, adjustments or transfers.
 * Days outside the year are ignored.
 */
export function monthlyIncomeForYear(year: number, daily: readonly DailyTotal[]): MonthlyIncome[] {
  const months = Array.from({ length: 12 }, (_, i): MonthlyIncome => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}-01`,
    incomeCents: 0,
  }))
  for (const day of daily) {
    if (day.day.slice(0, 4) !== String(year)) continue
    const index = Number(day.day.slice(5, 7)) - 1
    const row = months[index]
    if (row) row.incomeCents += day.incomeCents
  }
  return months
}

export function annualIncomeCents(months: readonly MonthlyIncome[]): Cents {
  return months.reduce((sum, m) => sum + m.incomeCents, 0)
}
