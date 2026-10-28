import { parsePeriodSummary } from './periodSummary'

describe('parsePeriodSummary', () => {
  it('turns JSON numbers into cents', () => {
    const summary = parsePeriodSummary({
      income: 1000,
      expense: 414500.5,
      balance: -413500.5,
      by_category: [
        {
          category_id: 'a',
          name: 'Comida',
          color: '#E5533D',
          icon: 'Utensils',
          amount: 10500.5,
          percent: 2.5,
        },
        {
          category_id: 'template:none',
          name: 'Gastos compartidos',
          color: '#6B7280',
          icon: 'Sparkles',
          amount: 3,
          percent: null,
        },
      ],
      daily: [{ day: '2026-10-02', expense: 3000, income: 0 }],
    })
    expect(summary.expenseCents).toBe(41_450_050)
    expect(summary.balanceCents).toBe(-41_350_050)
    expect(summary.byCategory[0]?.amountCents).toBe(1_050_050)
    expect(summary.byCategory[1]?.percent).toBe(0)
    expect(summary.daily[0]).toEqual({ day: '2026-10-02', expenseCents: 300_000, incomeCents: 0 })
  })

  it('rejects a malformed payload', () => {
    expect(() => parsePeriodSummary({ income: 'x' })).toThrow()
  })
})
