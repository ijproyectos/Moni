// Monetary values are handled as integer cents in the client to avoid floating point drift.
// PostgreSQL stores them as numeric(14,2); the database stays authoritative.

export type Cents = number

const DECIMAL_PATTERN = /^-?\d+(?:[.,]\d{1,2})?$/

export function toCents(value: string | number): Cents {
  const raw = typeof value === 'number' ? value.toFixed(2) : value.trim()
  if (!DECIMAL_PATTERN.test(raw)) throw new Error(`Invalid amount: ${value}`)
  const negative = raw.startsWith('-')
  const [whole = '0', fraction = ''] = raw.replace('-', '').split(/[.,]/)
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -cents : cents
}

export function fromCents(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer: ${cents}`)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Formats cents as an ARS amount the way the designs show it: "$12.345,50", "-$22.000". */
export function formatArs(cents: Cents, options: { signed?: boolean } = {}): string {
  const abs = arsFormatter.format(Math.abs(cents) / 100)
  const sign = cents < 0 ? '-' : options.signed && cents > 0 ? '+' : ''
  return `${sign}$${abs}`
}

/** Splits an amount into equal integer-cent shares; leftover cents go to the first shares. */
export function splitEqually(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(total) || total < 0)
    throw new Error('Total must be non-negative integer cents')
  if (!Number.isInteger(parts) || parts <= 0) throw new Error('Parts must be a positive integer')
  const base = Math.floor(total / parts)
  const remainder = total - base * parts
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0))
}
