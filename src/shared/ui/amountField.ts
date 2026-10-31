import type { ChangeEvent } from 'react'
import {
  caretAfterAmountChars,
  countAmountChars,
  formatAmountInput,
  formatAmountTyping,
  parseAmountInput,
} from '@/shared/lib/amountInput'

type AmountChange = (event: ChangeEvent<HTMLInputElement>) => void

// Per input: a "," that came from a typed "." (phone keypads), so a third decimal digit can reveal the
// person was typing a thousands separator ("6.250" typed key by key).
const commaFromDot = new WeakSet<HTMLInputElement>()

interface InputLike {
  inputType?: string
  data?: string | null
}

/**
 * Wraps an `onChange` (controlled state or react-hook-form `register`) so the field shows es-AR thousands
 * separators while typing. The original handler receives the same event with `target.value` already formatted.
 */
export function withAmountFormatting(onChange?: AmountChange): AmountChange {
  return (event) => {
    formatAmountEvent(event)
    onChange?.(event)
  }
}

export function formatAmountEvent(event: ChangeEvent<HTMLInputElement>): void {
  const input = event.target
  const { inputType = '', data = null } = event.nativeEvent as InputLike
  const raw = input.value
  const caret = input.selectionStart ?? raw.length
  const atEnd = caret >= raw.length
  let text = raw
  let before = raw.slice(0, caret)
  const isInsert = inputType.startsWith('insert') && inputType !== 'insertFromPaste'
  // Some keyboards do not say which character they inserted (`data: null`): it is the one right before the caret.
  const typed = data ?? (isInsert ? (raw[caret - 1] ?? null) : null)
  let fromDot = false

  if (inputType === '' || inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
    // Paste (or a programmatic change): trust the whole text when it is a complete amount.
    const cents = parseAmountInput(raw)
    if (cents !== null) {
      text = formatAmountInput(cents)
      before = text
    }
  } else if (
    isInsert &&
    typed === '.' &&
    !raw.slice(0, caret - 1).includes(',') &&
    !raw.slice(caret).includes(',')
  ) {
    // A typed "." is a decimal comma (phone keypads), as long as there is no comma yet.
    text = `${raw.slice(0, caret - 1)},${raw.slice(caret)}`
    before = text.slice(0, caret)
    fromDot = true
  } else if (
    isInsert &&
    typed !== null &&
    /^\d$/.test(typed) &&
    atEnd &&
    commaFromDot.has(input) &&
    /,\d{3}$/.test(raw)
  ) {
    // "6.250" typed key by key: three digits after a dot-comma mean it was a thousands separator.
    text = raw.replace(',', '')
    before = text
  }

  let formatted = formatAmountTyping(text)
  let anchor = countAmountChars(before, before.length)

  const previous = `${raw.slice(0, caret)}.${raw.slice(caret)}`
  if (
    inputType === 'deleteContentBackward' &&
    formatted === previous &&
    formatAmountTyping(previous) === previous
  ) {
    // Backspace only removed a thousands dot: delete the digit before it instead of doing nothing.
    const chars = raw.slice(0, caret).replace(/[^\d,]/g, '')
    const rest = raw.slice(caret)
    formatted = formatAmountTyping(chars.slice(0, -1) + rest)
    anchor = Math.max(0, chars.length - 1)
  }

  const typedDigit = isInsert && typed !== null && /^\d$/.test(typed)
  if (fromDot || (typedDigit && commaFromDot.has(input) && formatted.includes(','))) {
    commaFromDot.add(input)
  } else {
    commaFromDot.delete(input)
  }

  if (input.value !== formatted) input.value = formatted
  const position = caretAfterAmountChars(formatted, anchor)
  try {
    input.setSelectionRange(position, position)
  } catch {
    // Some input types do not support selection; the value is already correct.
  }
}
