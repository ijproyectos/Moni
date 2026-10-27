// Calendar helpers on ISO date strings ("YYYY-MM-DD"). They avoid Date-in-local-timezone pitfalls:
// movements are dated by calendar day, not by instant.

export type IsoDate = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Today's calendar date in the device's timezone. */
export function todayIso(now: Date = new Date()): IsoDate {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** First day of the month containing `date`: "2026-10-17" -> "2026-10-01". */
export function monthStart(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`
}

export function shiftMonth(month: IsoDate, delta: number): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const shifted = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function daysInMonth(month: IsoDate): number {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Inclusive date range covering the whole month. */
export function monthRange(month: IsoDate): { from: IsoDate; to: IsoDate } {
  const start = monthStart(month)
  return { from: start, to: `${start.slice(0, 7)}-${String(daysInMonth(start)).padStart(2, '0')}` }
}

/** Day of week for an ISO date, Monday = 0 ... Sunday = 6 (calendar grids start on Monday in Argentina). */
export function weekdayIndex(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** Adds calendar days to an ISO date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
