import { isVirtualCategoryId, parseMonthSummary } from './monthSummary'

describe('parseMonthSummary', () => {
  it('converts every amount to integer cents', () => {
    const summary = parseMonthSummary({
      income: 3000,
      expense: 1234.5,
      balance: 1765.5,
      available_balance: 7000.1,
      by_category: [
        {
          category_id: 'c1',
          name: 'Comida',
          color: '#E5533D',
          icon: 'Utensils',
          amount: 1234.5,
          percent: 100,
        },
      ],
      daily: [{ day: '2026-10-10', expense: 1234.5, income: 0 }],
      recent: [],
    })
    expect(summary.expenseCents).toBe(123450)
    expect(summary.availableBalanceCents).toBe(700010)
    expect(summary.byCategory[0]?.amountCents).toBe(123450)
    expect(summary.daily[0]?.expenseCents).toBe(123450)
  })

  it('treats a missing percent as zero and rejects malformed payloads', () => {
    const base = { income: 0, expense: 0, balance: 0, available_balance: 0, daily: [], recent: [] }
    const ok = parseMonthSummary({
      ...base,
      by_category: [
        { category_id: 'c', name: 'X', color: '#000000', icon: 'Heart', amount: 0, percent: null },
      ],
    })
    expect(ok.byCategory[0]?.percent).toBe(0)
    expect(() => parseMonthSummary({ income: 'x' })).toThrow()
  })

  it('recognizes virtual template categories', () => {
    expect(isVirtualCategoryId('template:restaurant')).toBe(true)
    expect(isVirtualCategoryId('template:none')).toBe(true)
    expect(isVirtualCategoryId('0b6f4a52-0000-4000-8000-000000000000')).toBe(false)
  })
})
