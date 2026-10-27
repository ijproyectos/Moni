import { formatAmountInput, parseAmountInput } from './amountInput'

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
