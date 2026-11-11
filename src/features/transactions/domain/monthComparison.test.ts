import { compareMonths } from './monthComparison'
import { makeTransaction } from './testing'

const tx = (occurredOn: string, amountCents: number, extra = {}) =>
  makeTransaction({ id: `${occurredOn}-${amountCents}`, occurredOn, amountCents, ...extra })

describe('compareMonths', () => {
  const today = '2026-11-10'

  it('compares the month in progress with the previous one up to the same day', () => {
    const result = compareMonths(
      [
        tx('2026-11-03', 100_000),
        tx('2026-11-10', 50_000),
        tx('2026-10-05', 120_000),
        tx('2026-10-10', 80_000),
        // After day 10 of the previous month: left out of the fair comparison.
        tx('2026-10-20', 900_000),
      ],
      'expense',
      '2026-11-01',
      today,
    )
    expect(result.currentCents).toBe(150_000)
    expect(result.previousCents).toBe(200_000)
    expect(result.deltaPct).toBe(-25)
  })

  it('has no percentage when the previous month has nothing', () => {
    const result = compareMonths([tx('2026-11-02', 10_000)], 'expense', '2026-11-01', today)
    expect(result.previousCents).toBe(0)
    expect(result.deltaPct).toBeNull()
  })

  it('ignores income, voided rows and future days of the month in progress', () => {
    const result = compareMonths(
      [
        tx('2026-11-02', 10_000, { kind: 'income' }),
        tx('2026-11-02', 20_000, { status: 'voided' }),
        tx('2026-11-25', 30_000),
        tx('2026-11-04', 5_000),
      ],
      'expense',
      '2026-11-01',
      today,
    )
    expect(result.currentCents).toBe(5_000)
  })

  it('compares a finished month whole', () => {
    const result = compareMonths(
      [tx('2026-10-31', 100_000), tx('2026-09-30', 50_000)],
      'expense',
      '2026-10-01',
      today,
    )
    expect(result.currentCents).toBe(100_000)
    expect(result.previousCents).toBe(50_000)
    expect(result.deltaPct).toBe(100)
  })
})
