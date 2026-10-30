import { annualIncomeCents, monthlyIncomeForYear } from './monthlyIncome'

const day = (d: string, incomeCents: number, expenseCents = 0) => ({
  day: d,
  incomeCents,
  expenseCents,
})

describe('monthlyIncomeForYear', () => {
  it('always returns the 12 months of the year, with $0 where there was no income', () => {
    const months = monthlyIncomeForYear(2026, [])
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: '2026-01-01', incomeCents: 0 })
    expect(months[11]).toEqual({ month: '2026-12-01', incomeCents: 0 })
  })

  it('adds the daily income of each month and ignores expenses', () => {
    const months = monthlyIncomeForYear(2026, [
      day('2026-01-05', 100_000_00),
      day('2026-01-20', 50_000_00, 9_999_00),
      day('2026-03-01', 20_000_00),
      day('2026-10-31', 1_00),
    ])
    expect(months.map((m) => m.incomeCents)).toEqual([
      150_000_00, 0, 20_000_00, 0, 0, 0, 0, 0, 0, 1_00, 0, 0,
    ])
    expect(annualIncomeCents(months)).toBe(170_000_00 + 1_00)
  })

  it('ignores days outside the requested year', () => {
    const months = monthlyIncomeForYear(2026, [day('2025-12-31', 5_00), day('2027-01-01', 7_00)])
    expect(annualIncomeCents(months)).toBe(0)
  })
})
