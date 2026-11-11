import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import type { MonthlyRow } from './savingsPlan'

export interface YearSavings {
  year: number
  /** Net saved in the year: contributions minus what was taken out. */
  savedCents: Cents
  /** Average per month, from the first month with records to the current one, in whole pesos. */
  averagePerMonthCents: Cents
}

/** What the person really saved in the year of `today`. Null when nothing was saved (so nothing is claimed). */
export function yearSavings(rows: readonly MonthlyRow[], today: IsoDate): YearSavings | null {
  const year = Number(today.slice(0, 4))
  const inYear = rows.filter((r) => Number(r.month.slice(0, 4)) === year)
  const savedCents = inYear.reduce((sum, r) => sum + r.depositedCents - r.withdrawnCents, 0)
  if (savedCents <= 0) return null
  const firstMonth = Math.min(...inYear.map((r) => Number(r.month.slice(5, 7))))
  const elapsed = Math.max(1, Number(today.slice(5, 7)) - firstMonth + 1)
  return {
    year,
    savedCents,
    averagePerMonthCents: Math.round(savedCents / elapsed / 100) * 100,
  }
}
