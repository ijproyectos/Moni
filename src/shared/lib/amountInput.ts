import { toCents, type Cents } from './money'

// Parses what a person types in an amount field, es-AR style: "1.234,50", "1234,5", "$ 1.500", "850".
// Dots are thousands separators unless they are followed by 1-2 digits and there is no comma ("12.5").
const WITH_COMMA = /^\d{1,3}(?:\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/
const THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/
const PLAIN = /^\d+(?:\.\d{1,2})?$/

/** Returns integer cents, or null when the text is not a valid non-negative amount. */
export function parseAmountInput(input: string): Cents | null {
  const text = input.replace(/[\s$]/g, '')
  if (text === '') return null
  if (WITH_COMMA.test(text)) return toCents(text.replaceAll('.', ''))
  if (THOUSANDS.test(text)) return toCents(text.replaceAll('.', ''))
  if (PLAIN.test(text)) return toCents(text)
  return null
}

/** Formats cents as an editable es-AR string without currency symbol: 123450 -> "1.234,50", 150000 -> "1.500". */
export function formatAmountInput(cents: Cents): string {
  const whole = Math.trunc(Math.abs(cents) / 100)
  const fraction = Math.abs(cents) % 100
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = cents < 0 ? '-' : ''
  return fraction === 0
    ? `${sign}${grouped}`
    : `${sign}${grouped},${String(fraction).padStart(2, '0')}`
}
