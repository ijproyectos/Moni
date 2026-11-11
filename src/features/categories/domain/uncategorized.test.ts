import { countUncategorized } from './uncategorized'

const tx = (over = {}) => ({
  kind: 'expense' as const,
  status: 'posted' as const,
  categoryId: null as string | null,
  occurredOn: '2026-11-05',
  ...over,
})

describe('countUncategorized', () => {
  it('counts posted income and expenses of the month without category', () => {
    expect(
      countUncategorized(
        [
          tx(),
          tx({ kind: 'income' }),
          tx({ categoryId: 'c' }),
          tx({ status: 'voided' }),
          tx({ occurredOn: '2026-10-31' }),
          tx({ occurredOn: '2026-12-01' }),
          tx({ kind: 'adjustment_in' }),
        ],
        '2026-11-15',
      ),
    ).toBe(2)
  })

  it('is 0 when everything has a category', () => {
    expect(countUncategorized([tx({ categoryId: 'c' })], '2026-11-01')).toBe(0)
  })
})
