import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso, type IsoDate } from '@/shared/lib/month'

/** Calendar day (local) of a timestamp. A date-only value (no time) keeps its own day. */
export function noticeDay(at: string, hasTime = true): IsoDate {
  if (!hasTime || at.length <= 10) return at.slice(0, 10)
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at.slice(0, 10) : todayIso(d)
}

/** "14:32", or null when the notice only knows its day. */
export function noticeTime(at: string, hasTime = true): string | null {
  if (!hasTime) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Hoy · 14:32", "Ayer · 09:10", "20 nov · 18:05" (no time part when it is unknown). */
export function noticeStamp(at: string, today: IsoDate, hasTime = true): string {
  const day = formatRelativeDay(noticeDay(at, hasTime), today)
  const time = noticeTime(at, hasTime)
  return time ? `${day} · ${time}` : day
}

export interface DayGroup<T> {
  day: IsoDate
  /** "Hoy", "Ayer" or "20 nov". */
  label: string
  items: T[]
}

/** Newest day first: Hoy, Ayer and then the earlier dates. Items keep their order inside each day. */
export function groupByDay<T>(items: readonly T[], dayOf: (item: T) => IsoDate, today: IsoDate): DayGroup<T>[] {
  const groups = new Map<IsoDate, T[]>()
  for (const item of items) {
    const day = dayOf(item)
    groups.set(day, [...(groups.get(day) ?? []), item])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({ day, label: formatRelativeDay(day, today), items: list }))
}
