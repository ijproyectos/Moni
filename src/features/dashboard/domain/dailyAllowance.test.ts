import { describe, expect, it } from 'vitest'
import {
  dailyAllowance,
  expectedIncomeCents,
  monthEnd,
  sumDueThisMonth,
  type DailyAllowanceData,
  type DailyAllowanceInput,
} from './dailyAllowance'

const base: DailyAllowanceInput = {
  today: '2026-11-10',
  expectedIncomeCents: 100_000_00,
  pendingFixedCents: 20_000_00,
  pendingSubscriptionsCents: 5_000_00,
  pendingInstallmentsCents: 10_000_00,
  goalsCents: 5_000_00,
  spentCents: 10_000_00,
}

const ok = (input: Partial<DailyAllowanceInput> = {}) =>
  dailyAllowance({ ...base, ...input }) as DailyAllowanceData

describe('expectedIncomeCents', () => {
  it('uses the current month when it is the largest', () => {
    expect(expectedIncomeCents(300, [100, 100])).toBe(300)
  })
  it('falls back to the average of previous months with income', () => {
    expect(expectedIncomeCents(0, [100, 0, 300])).toBe(200)
  })
  it('takes the larger of partial income and the average', () => {
    expect(expectedIncomeCents(50, [200, 200])).toBe(200)
  })
  it('ignores months beyond the lookback', () => {
    expect(expectedIncomeCents(0, [100, 100, 100, 9_000])).toBe(100)
  })
  it('is null without any income', () => {
    expect(expectedIncomeCents(0, [])).toBeNull()
    expect(expectedIncomeCents(0, [0, 0, 0])).toBeNull()
  })
})

describe('dailyAllowance', () => {
  it('returns sin-datos without income', () => {
    expect(dailyAllowance({ ...base, expectedIncomeCents: null })).toEqual({ kind: 'sin-datos' })
    expect(dailyAllowance({ ...base, expectedIncomeCents: 0 })).toEqual({ kind: 'sin-datos' })
  })

  it('spreads what is left over the remaining days, today included', () => {
    const a = ok()
    // (100k - 40k committed - 10k spent) = 50k over days 10..30 = 21 days
    expect(a.daysLeft).toBe(21)
    expect(a.committedCents).toBe(40_000_00)
    expect(a.spendBudgetCents).toBe(60_000_00)
    expect(a.remainingCents).toBe(50_000_00)
    expect(a.dailyCents).toBe(Math.floor(50_000_00 / 21))
    expect(a.overCents).toBe(0)
  })

  it('day 1 uses the whole month', () => {
    const a = ok({ today: '2026-11-01', spentCents: 0 })
    expect(a.daysLeft).toBe(30)
    expect(a.dailyCents).toBe(2_000_00)
  })

  it('last day leaves a single day', () => {
    const a = ok({ today: '2026-11-30' })
    expect(a.daysLeft).toBe(1)
    expect(a.dailyCents).toBe(a.remainingCents)
  })

  it('handles 28 and 31 day months', () => {
    expect(ok({ today: '2026-02-01', spentCents: 0 }).daysLeft).toBe(28)
    expect(ok({ today: '2028-02-01', spentCents: 0 }).daysLeft).toBe(29)
    expect(ok({ today: '2026-12-01', spentCents: 0 }).daysLeft).toBe(31)
    expect(ok({ today: '2026-12-31' }).daysLeft).toBe(1)
  })

  it('reports an overspend with a zero allowance', () => {
    const a = ok({ spentCents: 70_000_00 })
    expect(a.remainingCents).toBe(-10_000_00)
    expect(a.dailyCents).toBe(0)
    expect(a.overCents).toBe(10_000_00)
  })

  it('gives zero when exactly nothing is left', () => {
    const a = ok({ spentCents: 60_000_00 })
    expect(a.remainingCents).toBe(0)
    expect(a.dailyCents).toBe(0)
    expect(a.overCents).toBe(0)
  })

  it('commitments above the income leave a negative budget', () => {
    const a = ok({ pendingFixedCents: 200_000_00, spentCents: 0 })
    expect(a.spendBudgetCents).toBeLessThan(0)
    expect(a.dailyCents).toBe(0)
    expect(a.overCents).toBe(-a.spendBudgetCents)
  })

  it('floors to whole cents', () => {
    const a = ok({ today: '2026-11-28', spentCents: 0, pendingFixedCents: 0, pendingSubscriptionsCents: 0, pendingInstallmentsCents: 0, goalsCents: 0, expectedIncomeCents: 100 })
    expect(a.daysLeft).toBe(3)
    expect(a.dailyCents).toBe(33)
  })

  it('ignores negative inputs', () => {
    const a = ok({ pendingFixedCents: -5, spentCents: -5 })
    expect(a.spentCents).toBe(0)
    expect(a.committedCents).toBe(20_000_00)
  })
})

describe('sumDueThisMonth', () => {
  it('adds only items from today to the end of the month', () => {
    const items = [
      { date: '2026-11-09', amountCents: 1 },
      { date: '2026-11-10', amountCents: 10 },
      { date: '2026-11-30', amountCents: 100 },
      { date: '2026-12-01', amountCents: 1000 },
    ]
    expect(sumDueThisMonth(items, '2026-11-10')).toBe(110)
  })
  it('monthEnd handles leap years', () => {
    expect(monthEnd('2028-02-10')).toBe('2028-02-29')
  })
})
