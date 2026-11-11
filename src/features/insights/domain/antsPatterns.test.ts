import type { AntExpenses, AntGroup } from './ants'
import { antsByWeekday, antSavings, busiestWeekdays, weekdayHeadline } from './antsPatterns'

const group = (over: Partial<AntGroup> = {}): AntGroup => ({
  categoryId: 'c1',
  categoryName: 'Café',
  color: '#fff',
  icon: 'coffee',
  label: 'Cafecito',
  count: 10,
  totalCents: 30_000_00,
  averageCents: 3_000_00,
  yearlyProjectionCents: 360_000_00,
  ...over,
})
const ants: AntExpenses = {
  month: '2026-11-01',
  thresholdCents: 5_000_00,
  monthTotalCents: 30_000_00,
  shareOfExpenses: 5,
  groups: [group()],
}
const tx = (occurredOn: string, over = {}) => ({
  kind: 'expense' as const,
  status: 'posted' as const,
  categoryId: 'c1',
  note: 'cafecito ',
  amountCents: 3_000_00,
  occurredOn,
  ...over,
})
const names = new Map([['c1', 'Café']])

describe('antsByWeekday', () => {
  it('counts only the movements that belong to an ant group, by weekday (Monday = 0)', () => {
    const counts = antsByWeekday(
      ants,
      [
        tx('2026-11-05'), // Thursday
        tx('2026-11-12'), // Thursday
        tx('2026-11-06'), // Friday
        tx('2026-11-07', { note: 'otra cosa' }), // other group
        tx('2026-11-08', { amountCents: 9_000_00 }), // above the threshold
        tx('2026-10-30'), // other month
        tx('2026-11-09', { kind: 'income' }),
        tx('2026-11-10', { categoryId: null }),
      ],
      names,
    )
    expect(counts).toEqual([0, 0, 0, 2, 1, 0, 0])
  })

  it('uses the category name when the movement has no note', () => {
    const noNote = { ...ants, groups: [group({ label: 'Café' })] }
    expect(antsByWeekday(noNote, [tx('2026-11-02', { note: null })], names)[0]).toBe(1)
  })
})

describe('busiestWeekdays / weekdayHeadline', () => {
  it('picks the busiest and a close second', () => {
    expect(busiestWeekdays([1, 3, 1, 5, 4, 0, 0])).toEqual([3, 4])
    expect(weekdayHeadline([3, 4])).toBe('Más jueves y viernes')
  })

  it('keeps one day when the second is far behind, and is empty without data', () => {
    expect(busiestWeekdays([0, 1, 0, 5, 2, 0, 0])).toEqual([3])
    expect(weekdayHeadline([0])).toBe('Más los lunes')
    expect(busiestWeekdays([0, 0, 0, 0, 0, 0, 0])).toEqual([])
    expect(weekdayHeadline([])).toBe('')
  })
})

describe('antSavings', () => {
  it('cuts the weekly frequency by 40% and prorates the yearly projection', () => {
    // 10 purchases in 14 days = 5 per week -> 3 per week; saves 2/5 of 360.000
    expect(antSavings(group(), 14)).toEqual({
      label: 'Cafecito',
      fromPerWeek: 5,
      toPerWeek: 3,
      yearlyCents: 144_000_00,
    })
  })

  it('is null for rare ants or without days', () => {
    expect(antSavings(group({ count: 3 }), 30)).toBeNull()
    expect(antSavings(undefined, 30)).toBeNull()
    expect(antSavings(group(), 0)).toBeNull()
  })

  it('always cuts at least one per week', () => {
    expect(antSavings(group({ count: 2 }), 7)?.toPerWeek).toBe(1)
  })
})
