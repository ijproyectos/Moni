import type { CategorySlice } from './monthSummary'
import { barScale, groupCategories, lastMonths, mergeCategories, OTHER_ID, savingsSummary } from './stats'

const slice = (id: string, amountCents: number): CategorySlice => ({
  categoryId: id,
  name: id,
  color: '#123456',
  icon: 'x',
  amountCents,
  percent: 0,
})

describe('groupCategories', () => {
  it('keeps the top 4 and folds the rest into "Otras N"', () => {
    const result = groupCategories([
      slice('a', 320),
      slice('b', 180),
      slice('c', 140),
      slice('d', 100),
      slice('e', 90),
      slice('f', 80),
      slice('g', 90),
    ])
    expect(result.map((r) => r.name)).toEqual(['a', 'b', 'c', 'd', 'Otras 3'])
    const others = result[4]
    expect(others).toMatchObject({ id: OTHER_ID, amountCents: 260, color: null })
    expect(others?.percent).toBeCloseTo(26)
    expect(result.reduce((s, r) => s + r.percent, 0)).toBeCloseTo(100)
  })

  it('shows all categories when there is only one beyond the top 4', () => {
    expect(groupCategories([1, 2, 3, 4, 5].map((n) => slice(`c${n}`, n * 10)))).toHaveLength(5)
  })

  it('ignores zero amounts and is empty without spending', () => {
    expect(groupCategories([slice('a', 0)])).toEqual([])
    expect(groupCategories([])).toEqual([])
  })
})

describe('lastMonths', () => {
  it('lists consecutive months ending at the latest, crossing the year', () => {
    expect(lastMonths('2026-02-01', 4)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'])
  })
})

describe('savingsSummary', () => {
  it('computes the percentage and the monthly average over months with income', () => {
    const s = savingsSummary([
      { month: '2026-09-01', incomeCents: 1_000_00, expenseCents: 900_00 },
      { month: '2026-10-01', incomeCents: 1_000_00, expenseCents: 880_00 },
      { month: '2026-11-01', incomeCents: 0, expenseCents: 50_00 },
    ])
    expect(s).toEqual({ percent: 11, monthlyAverageCents: 110_00 })
  })

  it('is null without income and negative when spending exceeds it', () => {
    expect(savingsSummary([{ month: '2026-11-01', incomeCents: 0, expenseCents: 10 }])).toBeNull()
    expect(savingsSummary([{ month: '2026-11-01', incomeCents: 100, expenseCents: 150 }])?.percent).toBe(-50)
  })
})

describe('barScale', () => {
  it('scales both series to the biggest value', () => {
    expect(
      barScale([
        { month: 'a', incomeCents: 200, expenseCents: 100 },
        { month: 'b', incomeCents: 100, expenseCents: 50 },
      ]),
    ).toEqual([
      { expense: 0.5, income: 1 },
      { expense: 0.25, income: 0.5 },
    ])
  })
})

describe('mergeCategories', () => {
  it('adds the same category across months and recomputes shares', () => {
    const merged = mergeCategories([
      [slice('a', 100), slice('b', 50)],
      [slice('a', 100), slice('c', 50)],
    ])
    expect(merged.map((m) => [m.categoryId, m.amountCents])).toEqual([
      ['a', 200],
      ['b', 50],
      ['c', 50],
    ])
    expect(merged[0]?.percent).toBeCloseTo(66.67, 1)
    expect(mergeCategories([])).toEqual([])
  })
})
