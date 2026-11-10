import type { Cents } from '@/shared/lib/money'
import type { DailyAllowance, DailyAllowanceData } from './dailyAllowance'

/** The day reads "ajustado" when today's allowance falls under this share of an even daily split of the budget. */
export const TIGHT_DAILY_RATIO = 0.7

export type DayStatus = 'vas-bien' | 'ajustado' | 'te-pasaste'

/** Neutral, never blaming copy for each state. */
export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  'vas-bien': 'Vas bien',
  ajustado: 'Ajustado',
  'te-pasaste': 'Te pasaste un poco',
}

/**
 * Rule over the allowance: nothing left to spend -> te-pasaste; an allowance under TIGHT_DAILY_RATIO of an even
 * split of the month's budget -> ajustado; otherwise vas-bien. Returns null without data.
 */
export function dayStatus(allowance: DailyAllowance): DayStatus | null {
  if (allowance.kind === 'sin-datos') return null
  if (allowance.remainingCents <= 0) return 'te-pasaste'
  const even = allowance.spendBudgetCents / allowance.daysInMonth
  return allowance.dailyCents < even * TIGHT_DAILY_RATIO ? 'ajustado' : 'vas-bien'
}

export interface MonthPace {
  /** Position of today in the month: day / days in month, 0..1 (the marker of the bar). */
  dayPosition: number
  /** Spent so far as a share of the month's budget, clamped to 0..1 (the fill of the bar). */
  spentShare: number
  /** Linear expectation: spendBudget * dayPosition. */
  expectedCents: Cents
  spentCents: Cents
  /** Spent minus expected: positive means ahead of a linear pace. */
  deviationCents: Cents
  /** Spending is above the linear pace. */
  aheadOfPace: boolean
}

export function monthPace(allowance: DailyAllowanceData): MonthPace {
  const dayPosition = allowance.dayOfMonth / allowance.daysInMonth
  const budget = Math.max(0, allowance.spendBudgetCents)
  const expectedCents = Math.round(budget * dayPosition)
  const spentShare = budget > 0 ? Math.min(1, allowance.spentCents / budget) : allowance.spentCents > 0 ? 1 : 0
  const deviationCents = allowance.spentCents - expectedCents
  return {
    dayPosition,
    spentShare,
    expectedCents,
    spentCents: allowance.spentCents,
    deviationCents,
    aheadOfPace: deviationCents > 0,
  }
}
