import type { Transaction } from '@/features/transactions/domain/transaction'
import { weekdayIndex } from '@/shared/lib/month'
import type { Cents } from '@/shared/lib/money'
import { antKey, type AntExpenses, type AntGroup } from './ants'

// Patterns of the ants of a month, derived from the movements themselves (get_ant_expenses stays untouched).

export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const
export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

/**
 * How many ant purchases fall on each weekday (Monday = 0). A movement belongs to an ant group the same way the
 * database groups them: same category and same note (or the category name when there is none), amount under the
 * threshold. Only groups returned by the database count, so the bars always agree with the list.
 */
export function antsByWeekday(
  ants: AntExpenses,
  transactions: readonly Pick<Transaction, 'kind' | 'status' | 'categoryId' | 'note' | 'amountCents' | 'occurredOn'>[],
  categoryNames: ReadonlyMap<string, string>,
): number[] {
  const keys = new Set(ants.groups.map(antKey))
  const counts = [0, 0, 0, 0, 0, 0, 0]
  const month = ants.month.slice(0, 7)
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.status !== 'posted' || !t.categoryId) continue
    if (t.occurredOn.slice(0, 7) !== month || t.amountCents > ants.thresholdCents) continue
    const name = categoryNames.get(t.categoryId)
    const norm = (t.note?.trim() || name || '').toLowerCase()
    if (!norm || !keys.has(`${t.categoryId}|${norm}`)) continue
    const day = weekdayIndex(t.occurredOn)
    counts[day] = (counts[day] ?? 0) + 1
  }
  return counts
}

/** Weekdays to highlight: the busiest, plus the second one when it is close (60% or more of the busiest). */
export function busiestWeekdays(counts: readonly number[]): number[] {
  const ranked = counts
    .map((count, day) => ({ count, day }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count || a.day - b.day)
  const first = ranked[0]
  if (!first) return []
  const second = ranked[1]
  const picked = second && second.count >= first.count * 0.6 ? [first.day, second.day] : [first.day]
  return picked.sort((a, b) => a - b)
}

/** "Más jueves y viernes" / "Más los lunes"; empty without data. */
export function weekdayHeadline(days: readonly number[]): string {
  const names = days.map((d) => WEEKDAY_NAMES[d])
  if (names.length === 0) return ''
  if (names.length === 1) return `Más los ${names[0]}`
  return `Más ${names[0]} y ${names[1]}`
}

export const REDUCTION_SHARE = 0.4

export interface AntSavings {
  label: string
  fromPerWeek: number
  toPerWeek: number
  yearlyCents: Cents
}

/**
 * "Con 3 cafés por semana en vez de 5, ahorrás $X al año": the biggest ant, cut by 40% (rounded up to keep at least
 * one fewer per week). The saving is the same share of what the database projects for the year. Null when the ant
 * happens fewer than twice a week (nothing sensible to cut).
 */
export function antSavings(group: AntGroup | undefined, daysObserved: number): AntSavings | null {
  if (!group || daysObserved <= 0) return null
  const from = Math.round((group.count * 7) / daysObserved)
  if (from < 2) return null
  const to = Math.max(0, Math.min(from - 1, Math.ceil(from * (1 - REDUCTION_SHARE))))
  return {
    label: group.label,
    fromPerWeek: from,
    toPerWeek: to,
    yearlyCents: Math.round((group.yearlyProjectionCents * (from - to)) / from),
  }
}
