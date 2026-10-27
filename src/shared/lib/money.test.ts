import { formatArs, formatCompact, fromCents, splitEqually, toCents } from './money'

describe('toCents', () => {
  it.each([
    ['12345.50', 1234550],
    ['12345,5', 1234550],
    ['0.01', 1],
    ['-22000', -2200000],
    [0.1 + 0.2, 30],
  ])('converts %s to %i cents', (input, expected) => {
    expect(toCents(input)).toBe(expected)
  })

  it('rejects malformed amounts', () => {
    expect(() => toCents('12.345')).toThrow()
    expect(() => toCents('abc')).toThrow()
  })
})

describe('fromCents', () => {
  it('renders a numeric string suitable for a numeric(14,2) column', () => {
    expect(fromCents(1234550)).toBe('12345.50')
    expect(fromCents(-5)).toBe('-0.05')
  })

  it('rejects non-integer cents', () => {
    expect(() => fromCents(1.5)).toThrow()
  })
})

describe('formatArs', () => {
  it('formats like the designs', () => {
    expect(formatArs(1234550)).toBe('$12.345,50')
    expect(formatArs(-2200000)).toBe('-$22.000')
    expect(formatArs(85050000, { signed: true })).toBe('+$850.500')
  })
})

describe('splitEqually', () => {
  it('distributes leftover cents to the first shares', () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333])
  })

  it('always sums to the total', () => {
    const shares = splitEqually(999_999, 7)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(999_999)
  })

  it('rejects invalid input', () => {
    expect(() => splitEqually(100, 0)).toThrow()
    expect(() => splitEqually(-1, 2)).toThrow()
  })
})

describe('formatCompact', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCompact(3_800_000)).toBe('38K')
    expect(formatCompact(2_850_000)).toBe('28,5K')
    expect(formatCompact(60_000)).toBe('600')
    expect(formatCompact(250_000_000)).toBe('2,5M')
  })
})
