import {
  caretAfterAmountChars,
  countAmountChars,
  formatAmountInput,
  formatAmountTyping,
  parseAmountInput,
} from './amountInput'

describe('parseAmountInput', () => {
  it.each([
    ['1.234,50', 123450],
    ['1234,5', 123450],
    ['$ 1.500', 150000],
    ['850', 85000],
    ['12.5', 1250],
    ['1.234.567', 123456700],
    ['0,99', 99],
  ])('parses %s as %i cents', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected)
  })

  it.each(['', 'abc', '1,234,5', '12,345', '-5', '1..5', '1.23,4,5'])('rejects %j', (input) => {
    expect(parseAmountInput(input)).toBeNull()
  })
})

describe('formatAmountInput', () => {
  it('round-trips through parseAmountInput', () => {
    for (const cents of [0, 1, 99, 85000, 123450, 150000, 123456700]) {
      expect(parseAmountInput(formatAmountInput(cents))).toBe(cents)
    }
  })

  it('groups thousands and pads decimals', () => {
    expect(formatAmountInput(123405)).toBe('1.234,05')
    expect(formatAmountInput(150000)).toBe('1.500')
  })
})

describe('formatAmountTyping', () => {
  it.each([
    ['', ''],
    ['7', '7'],
    ['1234', '1.234'],
    ['1234567', '1.234.567'],
    ['1.234.567', '1.234.567'],
    ['1234567,5', '1.234.567,5'],
    ['1234,567', '1.234,56'],
    ['007', '7'],
    ['0', '0'],
    ['0,', '0,'],
    [',', '0,'],
    [',5', '0,5'],
    ['12a3$ ', '123'],
    ['1,2,3', '1,23'],
    ['1234567890123456', '123.456.789.012'],
  ])('formats %j as %j', (input, expected) => {
    expect(formatAmountTyping(input)).toBe(expected)
  })

  it('produces text that parseAmountInput reads back', () => {
    expect(parseAmountInput(formatAmountTyping('1234567,5'))).toBe(123456750)
    expect(parseAmountInput(formatAmountTyping('2500'))).toBe(250000)
  })
})

describe('caret helpers', () => {
  it('counts digits and commas before a position', () => {
    expect(countAmountChars('1.234,5', 5)).toBe(4)
  })
  it('places the caret after the same number of digits/commas', () => {
    expect(caretAfterAmountChars('1.234', 4)).toBe(5)
    expect(caretAfterAmountChars('1.234', 1)).toBe(1)
    expect(caretAfterAmountChars('1.234', 0)).toBe(0)
    expect(caretAfterAmountChars('12', 9)).toBe(2)
  })
})
