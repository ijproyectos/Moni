import type { Cents } from '@/shared/lib/money'
import { TIGHT_DAILY_RATIO, type DayStatus } from './monthPace'

export interface TodayAfterExpense {
  /** What is left of today's allowance once this expense is in (never negative). */
  leftCents: Cents
  /** Share of today's allowance this expense uses, in whole percent (0..100, 100 when it takes everything or more). */
  usedPercent: number
  status: DayStatus
}

/**
 * "Hoy te quedan $X": today's allowance (`dailyCents`, computed without this expense) minus the expense.
 * Same thresholds as the day status: everything used or more -> te-pasaste; over TIGHT_DAILY_RATIO of it -> ajustado.
 */
export function todayAfterExpense(dailyCents: Cents, expenseCents: Cents): TodayAfterExpense {
  const amount = Math.max(0, expenseCents)
  if (dailyCents <= 0 || amount >= dailyCents) {
    return { leftCents: 0, usedPercent: 100, status: 'te-pasaste' }
  }
  const used = amount / dailyCents
  return {
    leftCents: dailyCents - amount,
    usedPercent: Math.round(used * 100),
    status: used >= TIGHT_DAILY_RATIO ? 'ajustado' : 'vas-bien',
  }
}
