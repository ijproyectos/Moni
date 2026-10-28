import { addDays, weekdayIndex, type IsoDate } from '@/shared/lib/month'

// Calendar weeks run Monday -> Sunday (Argentina). Ranges are [from, to): `to` is the next Monday.

export interface WeekRange {
  /** Monday. */
  from: IsoDate
  /** Next Monday (exclusive), as expected by get_period_summary. */
  to: IsoDate
  /** Sunday, for display. */
  lastDay: IsoDate
}

export function weekOf(date: IsoDate): WeekRange {
  const from = addDays(date, -weekdayIndex(date))
  return { from, to: addDays(from, 7), lastDay: addDays(from, 6) }
}

export function previousWeek(week: WeekRange): WeekRange {
  return weekOf(addDays(week.from, -7))
}

/** Change from `previous` to `current` in percent, rounded; null when there is no base to compare to. */
export function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export interface WeeklyComparison {
  /** null when last week had no spending. */
  deltaPercent: number | null
  direction: 'up' | 'down' | 'same' | 'new' | 'none'
}

export function compareWeeks(currentCents: number, previousCents: number): WeeklyComparison {
  if (currentCents === 0 && previousCents === 0) return { deltaPercent: null, direction: 'none' }
  if (previousCents === 0) return { deltaPercent: null, direction: 'new' }
  const deltaPercent = changePercent(currentCents, previousCents)
  if (deltaPercent === null || deltaPercent === 0) return { deltaPercent: 0, direction: 'same' }
  return { deltaPercent, direction: deltaPercent > 0 ? 'up' : 'down' }
}
