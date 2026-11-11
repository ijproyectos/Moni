import type { IsoDate } from '@/shared/lib/month'
import { countsInStatistics, type Transaction } from './transaction'

export interface CategoryWeekInsight {
  /** Position of this expense in the category during the week that ends on its date (the 4th one...). */
  count: number
  /** Typical weekly count of that category over the 4 weeks before, rounded. */
  average: number
}

const DAY_MS = 86_400_000

function dayNumber(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/**
 * "It is your 4th delivery of the week; your average is 2". Only for expenses with a category, and only when it is
 * above the person's own usual (so it never states an average without history, nor a count that is nothing special).
 */
export function categoryWeekInsight(
  tx: Transaction,
  all: readonly Transaction[],
): CategoryWeekInsight | null {
  if (tx.kind !== 'expense' || !tx.categoryId || !countsInStatistics(tx)) return null
  const end = dayNumber(tx.occurredOn)
  let count = 0
  let before = 0
  for (const other of all) {
    if (other.categoryId !== tx.categoryId || other.kind !== 'expense' || !countsInStatistics(other))
      continue
    const age = end - dayNumber(other.occurredOn)
    if (age >= 0 && age < 7) count += 1
    else if (age >= 7 && age < 35) before += 1
  }
  if (before === 0) return null
  const average = Math.round(before / 4)
  return count >= 2 && count > average ? { count, average } : null
}
