// Display helpers for the admin panel: Argentina time, ARS whole pesos, USD with 2 decimals, days-inactive chip.

export const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export type InactivityTone = 'active' | 'recent' | 'idle' | 'inactive'

export interface InactivityChip {
  tone: InactivityTone
  label: string
}

/** <=1 day: active, 2-7: recent, 8-30: idle, >30: inactive. */
export function daysInactiveChip(days: number): InactivityChip {
  if (days <= 1) return { tone: 'active', label: 'Activo' }
  if (days <= 7) return { tone: 'recent', label: 'Reciente' }
  if (days <= 30) return { tone: 'idle', label: 'En pausa' }
  return { tone: 'inactive', label: 'Inactivo' }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** ARS whole pesos: 1234.5 -> "$1.235", -50 -> "-$50". Deterministic (no ICU grouping rules). */
export function formatPesos(amount: number): string {
  if (!Number.isFinite(amount)) return '—'
  const rounded = Math.round(Math.abs(amount))
  return `${amount < 0 && rounded !== 0 ? '-' : ''}$${groupThousands(String(rounded))}`
}

/** AI cost in USD with 2 decimals: 1234.5 -> "US$ 1.234,50". */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return '—'
  const cents = Math.round(Math.abs(amount) * 100)
  const whole = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, '0')
  return `${amount < 0 && cents !== 0 ? '-' : ''}US$ ${groupThousands(String(whole))},${fraction}`
}

export function formatCount(value: number): string {
  return groupThousands(String(Math.round(value)))
}

const dateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: AR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parts(format: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]))
}

/** "01/11/2026 17:22" in Argentina time, or "—" for null / invalid. */
export function formatArDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const p = parts(dateTimeFormat, date)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** "01/11/2026" in Argentina time. */
export function formatArDate(iso: string | null | undefined): string {
  const full = formatArDateTime(iso)
  return full === '—' ? full : full.slice(0, 10)
}

/** "2026-11-01" -> "01/11" (a calendar day, no timezone shift). */
export function formatDayLabel(isoDay: string): string {
  const [, month, day] = isoDay.split('-')
  return month && day ? `${day}/${month}` : isoDay
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',')
  return `${text} ${units[unit]}`
}
