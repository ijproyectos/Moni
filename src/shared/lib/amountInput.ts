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

const MAX_INTEGER_DIGITS = 12

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Formats what a person is typing into es-AR text ("." thousands, "," decimals) so the size of the amount is
 * obvious while typing. Dots in the input are always treated as thousands separators here; the "typed dot
 * means decimal" and paste rules live in the DOM helper (`src/shared/ui/amountField.ts`).
 * "1234567" -> "1.234.567", "1234567,555" -> "1.234.567,55", "007" -> "7", "," -> "0,".
 */
export function formatAmountTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const commaAt = cleaned.indexOf(',')
  const integerSource = commaAt === -1 ? cleaned : cleaned.slice(0, commaAt)
  const integerDigits = integerSource.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  const integer = groupThousands(integerDigits.slice(0, MAX_INTEGER_DIGITS))
  if (commaAt === -1) return integer
  const decimals = cleaned
    .slice(commaAt + 1)
    .replace(/\D/g, '')
    .slice(0, 2)
  return `${integer === '' ? '0' : integer},${decimals}`
}

/** Digits and commas in `text` before `position`: the caret anchor that survives regrouping. */
export function countAmountChars(text: string, position: number): number {
  return text.slice(0, position).replace(/[^\d,]/g, '').length
}

/** Caret position in `formatted` that sits after `count` digits/commas. */
export function caretAfterAmountChars(formatted: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== '.') seen++
    if (seen === count) return i + 1
  }
  return formatted.length
}

export type AmountKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'back'

/**
 * Applies a key of the on-screen keypad to the text of an amount field, es-AR style: digits append (with thousands
 * regrouped), "," starts the decimals (once), "back" deletes the last digit. Never returns a malformed amount.
 */
export function applyAmountKey(current: string, key: AmountKey): string {
  if (key === 'back') {
    let next = current.slice(0, -1)
    if (next.endsWith('.')) next = next.slice(0, -1)
    return formatAmountTyping(next)
  }
  if (key === ',') {
    if (current.includes(',')) return current
    return formatAmountTyping(`${current === '' ? '0' : current},`)
  }
  return formatAmountTyping(current + key)
}
