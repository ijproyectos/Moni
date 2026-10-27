import type { IsoDate } from './month'

// Spanish (es-AR) labels for ISO calendar dates. Always formatted in UTC so the day never shifts.

const longDay = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const shortDay = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const monthYear = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthOnly = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' })

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Domingo, 25 de octubre". */
export function formatLongDay(date: IsoDate): string {
  const parts = longDay.formatToParts(toUtc(date))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${capitalize(get('weekday'))}, ${get('day')} de ${get('month')}`
}

/** "Octubre 2026". */
export function formatMonthYear(date: IsoDate): string {
  return capitalize(monthYear.format(toUtc(date)).replace(' de ', ' '))
}

/** "Octubre". */
export function formatMonthName(date: IsoDate): string {
  return capitalize(monthOnly.format(toUtc(date)))
}

/** "Hoy", "Ayer" or "25 oct". */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string {
  if (date === today) return 'Hoy'
  const yesterday = new Date(toUtc(today).getTime() - 86_400_000)
  if (toUtc(date).getTime() === yesterday.getTime()) return 'Ayer'
  return shortDay.format(toUtc(date)).replace('.', '')
}

const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]
const LONG_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function parts(date: IsoDate): [number, number, number] {
  return date.split('-').map(Number) as [number, number, number]
}

/** "31 de mar de 2027". */
export function formatShortDate(date: IsoDate): string {
  const [y, m, d] = parts(date)
  return `${d} de ${SHORT_MONTHS[m - 1]} de ${y}`
}

/** "27 feb 2027". */
export function formatCompactDate(date: IsoDate): string {
  const [y, m, d] = parts(date)
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`
}

/** "27 de febrero de 2027". */
export function formatLongDate(date: IsoDate): string {
  const [y, m, d] = parts(date)
  return `${d} de ${LONG_MONTHS[m - 1]} de ${y}`
}

/** "20 oct". */
export function formatDayMonth(date: IsoDate): string {
  const [, m, d] = parts(date)
  return `${d} ${SHORT_MONTHS[m - 1]}`
}

/** "oct de 2027". */
export function formatMonthShortYear(date: IsoDate): string {
  const [y, m] = parts(date)
  return `${SHORT_MONTHS[m - 1]} de ${y}`
}

/** "octubre". */
export function monthNameOf(date: IsoDate): string {
  return LONG_MONTHS[parts(date)[1] - 1] ?? ''
}
