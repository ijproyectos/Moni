import type { MonthlyRow } from './savingsPlan'
import { yearSavings } from './savingsYear'

const row = (month: string, depositedCents: number, withdrawnCents = 0): MonthlyRow => ({
  goalId: 'g',
  month,
  depositedCents,
  withdrawnCents,
  releasedCents: 0,
})

describe('yearSavings', () => {
  it('adds the net saved this year and averages it over the months elapsed', () => {
    const result = yearSavings(
      [row('2026-09-01', 300_000_00), row('2026-10-01', 120_000_00, 20_000_00), row('2025-12-01', 999_000_00)],
      '2026-11-10',
    )
    expect(result).toEqual({ year: 2026, savedCents: 400_000_00, averagePerMonthCents: 133_333_00 })
  })

  it('claims nothing without savings', () => {
    expect(yearSavings([], '2026-11-10')).toBeNull()
    expect(yearSavings([row('2026-10-01', 5_000_00, 5_000_00)], '2026-11-10')).toBeNull()
  })
})
