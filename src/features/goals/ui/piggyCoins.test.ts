import { COINS, coinLevel, coinsFor } from './piggyCoins'

describe('coinsFor', () => {
  it('is empty at 0, shows a coin as soon as something is saved and is full only at 100 %', () => {
    expect(coinsFor(0)).toBe(0)
    expect(coinsFor(0.001)).toBe(1)
    expect(coinsFor(0.99)).toBe(COINS.length)
    expect(coinLevel(0.99).full).toBe(COINS.length - 1)
    expect(coinsFor(1)).toBe(COINS.length)
    expect(coinsFor(1.4)).toBe(COINS.length)
  })
  it('a small contribution changes the number of coins and a withdrawal lowers it', () => {
    expect(coinsFor(0.3)).toBeGreaterThan(coinsFor(0.25))
    expect(coinsFor(0.2)).toBeLessThan(coinsFor(0.25))
  })
  it('ignores values that are not numbers', () => {
    expect(coinsFor(Number.NaN)).toBe(0)
  })

  it('a tiny contribution grows the last coin, so the picture changes even when no whole coin is added', () => {
    const before = coinLevel(0.021)
    const after = coinLevel(0.0227)
    expect(before.full).toBe(0)
    expect(after.partial).toBeGreaterThan(before.partial)
    expect(coinLevel(0).partial).toBe(0)
    expect(coinLevel(1).full).toBe(COINS.length)
  })
})
