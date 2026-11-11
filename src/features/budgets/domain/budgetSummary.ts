import type { Cents } from '@/shared/lib/money'
import { daysInMonth, type IsoDate } from '@/shared/lib/month'
import type { BudgetState, BudgetStatus } from './budget'

export interface BudgetSummary {
  limitCents: Cents
  spentCents: Cents
  /** Negative when the limits together are exceeded. */
  remainingCents: Cents
  percent: number
  state: BudgetState
  /** Days of the month after today. */
  daysLeft: number
  /** Where today sits in the month, 0..1 (the marker on the bar). */
  dayPosition: number
}

/** Same thresholds as each category: 80% or more is "ajustado", more than 100% is "te pasaste". */
export function stateOf(percent: number): BudgetState {
  return percent > 100 ? 'over' : percent >= 80 ? 'warning' : 'ok'
}

/** All limits of the month added up. Null when there are no budgets (nothing honest to show). */
export function summarizeBudgets(
  budgets: readonly BudgetStatus[],
  today: IsoDate,
): BudgetSummary | null {
  if (budgets.length === 0) return null
  const limitCents = budgets.reduce((sum, b) => sum + b.amountCents, 0)
  const spentCents = budgets.reduce((sum, b) => sum + b.spentCents, 0)
  const percent = limitCents > 0 ? (spentCents / limitCents) * 100 : 0
  const total = daysInMonth(today)
  const day = Number(today.slice(8, 10))
  return {
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    percent,
    state: stateOf(percent),
    daysLeft: Math.max(0, total - day),
    dayPosition: day / total,
  }
}
