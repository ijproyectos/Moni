import type { BudgetStatus } from './budget'
import { stateOf, summarizeBudgets } from './budgetSummary'

const budget = (amountCents: number, spentCents: number): BudgetStatus => ({
  budgetId: `${amountCents}-${spentCents}`,
  categoryId: 'c',
  name: 'Cat',
  color: '#000000',
  icon: 'Tag',
  amountCents,
  spentCents,
  remainingCents: amountCents - spentCents,
  percent: (spentCents / amountCents) * 100,
  state: 'ok',
})

describe('summarizeBudgets', () => {
  it('has nothing to say without budgets', () => {
    expect(summarizeBudgets([], '2026-11-10')).toBeNull()
  })

  it('adds the limits up and counts the days left of the month', () => {
    const summary = summarizeBudgets([budget(100_000, 30_000), budget(50_000, 10_000)], '2026-11-10')
    expect(summary).toMatchObject({
      limitCents: 150_000,
      spentCents: 40_000,
      remainingCents: 110_000,
      state: 'ok',
      daysLeft: 20,
    })
    expect(summary?.dayPosition).toBeCloseTo(1 / 3)
  })

  it('is negative and "over" when the limits together are exceeded', () => {
    const summary = summarizeBudgets([budget(100_000, 130_000)], '2026-11-30')
    expect(summary?.remainingCents).toBe(-30_000)
    expect(summary?.state).toBe('over')
    expect(summary?.daysLeft).toBe(0)
  })

  it('uses the thresholds of each category', () => {
    expect(stateOf(79.9)).toBe('ok')
    expect(stateOf(80)).toBe('warning')
    expect(stateOf(100)).toBe('warning')
    expect(stateOf(100.1)).toBe('over')
  })
})
