import { describe, expect, it } from 'vitest'
import { dailyAllowance, type DailyAllowanceData, type DailyAllowanceInput } from './dailyAllowance'
import { DAY_STATUS_LABELS, TIGHT_DAILY_RATIO, dayStatus, monthPace } from './monthPace'

const base: DailyAllowanceInput = {
  today: '2026-11-10',
  expectedIncomeCents: 90_000_00,
  pendingFixedCents: 0,
  pendingSubscriptionsCents: 0,
  pendingInstallmentsCents: 0,
  goalsCents: 0,
  spentCents: 0,
}
const data = (input: Partial<DailyAllowanceInput> = {}) =>
  dailyAllowance({ ...base, ...input }) as DailyAllowanceData

describe('dayStatus', () => {
  it('is null without data', () => {
    expect(dayStatus({ kind: 'sin-datos' })).toBeNull()
  })
  it('vas-bien on pace', () => {
    expect(dayStatus(data({ today: '2026-11-01' }))).toBe('vas-bien')
    // spent exactly linear until day 9
    expect(dayStatus(data({ spentCents: 27_000_00 }))).toBe('vas-bien')
  })
  it('ajustado when the allowance drops under the threshold', () => {
    // budget 90k over 30 days = 3k even; threshold 0.7 -> 2.1k. Spent 60k by day 10: 30k/21 = 1428
    expect(TIGHT_DAILY_RATIO).toBe(0.7)
    expect(dayStatus(data({ spentCents: 60_000_00 }))).toBe('ajustado')
  })
  it('boundary: exactly at the threshold is still vas-bien', () => {
    // even = 3000_00 ; daily needed = 2100_00 -> remaining = 2100_00*21 = 44100_00
    const a = data({ spentCents: 90_000_00 - 44_100_00 })
    expect(a.dailyCents).toBe(2_100_00)
    expect(dayStatus(a)).toBe('vas-bien')
    expect(dayStatus(data({ spentCents: 90_000_00 - 44_100_00 + 21 }))).toBe('ajustado')
  })
  it('te-pasaste when nothing is left', () => {
    expect(dayStatus(data({ spentCents: 90_000_00 }))).toBe('te-pasaste')
    expect(dayStatus(data({ spentCents: 100_000_00 }))).toBe('te-pasaste')
  })
  it('last day with money left is vas-bien or ajustado, never te-pasaste', () => {
    expect(dayStatus(data({ today: '2026-11-30', spentCents: 80_000_00 }))).toBe('vas-bien')
  })
  it('never uses blaming copy', () => {
    for (const label of Object.values(DAY_STATUS_LABELS)) {
      expect(label).not.toMatch(/culpa|mal|error|gastaste de m[aá]s/i)
    }
  })
})

describe('monthPace', () => {
  it('day 1', () => {
    const p = monthPace(data({ today: '2026-11-01' }))
    expect(p.dayPosition).toBeCloseTo(1 / 30)
    expect(p.spentShare).toBe(0)
    expect(p.expectedCents).toBe(3_000_00)
    expect(p.aheadOfPace).toBe(false)
  })
  it('last day: position is 1 and expected equals the budget', () => {
    const p = monthPace(data({ today: '2026-11-30', spentCents: 90_000_00 }))
    expect(p.dayPosition).toBe(1)
    expect(p.expectedCents).toBe(90_000_00)
    expect(p.spentShare).toBe(1)
    expect(p.deviationCents).toBe(0)
  })
  it('flags spending ahead of the linear pace', () => {
    const p = monthPace(data({ spentCents: 50_000_00 }))
    expect(p.expectedCents).toBe(30_000_00)
    expect(p.deviationCents).toBe(20_000_00)
    expect(p.aheadOfPace).toBe(true)
  })
  it('clamps the bar when overspent', () => {
    expect(monthPace(data({ spentCents: 120_000_00 })).spentShare).toBe(1)
  })
  it('handles 28 day months', () => {
    const p = monthPace(data({ today: '2026-02-14', spentCents: 0 }))
    expect(p.dayPosition).toBe(0.5)
    expect(p.expectedCents).toBe(45_000_00)
  })
  it('zero budget', () => {
    const p = monthPace(data({ goalsCents: 90_000_00 }))
    expect(p.expectedCents).toBe(0)
    expect(p.spentShare).toBe(0)
    const q = monthPace(data({ goalsCents: 90_000_00, spentCents: 5 }))
    expect(q.spentShare).toBe(1)
  })
})
