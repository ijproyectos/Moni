import type { Cents } from '@/shared/lib/money'

/** Share of the income Moni suggests to set aside every month. */
export const SUGGESTED_SAVINGS_PERCENT = 15

const WHOLE_THOUSAND_CENTS = 1_000 * 100

/** Pay days offered as chips; "Otro" lets the person type any day. */
export const PAY_DAY_CHOICES = [1, 5, 10, 15] as const

/**
 * Suggested monthly budget: the income minus the share to save, rounded down to a whole thousand pesos so it reads
 * as a round figure. Pure: nothing is invented, it only depends on what the person typed.
 */
export function suggestedBudgetCents(incomeCents: Cents): Cents {
  if (incomeCents <= 0) return 0
  const afterSavings = (incomeCents * (100 - SUGGESTED_SAVINGS_PERCENT)) / 100
  const rounded = Math.floor(afterSavings / WHOLE_THOUSAND_CENTS) * WHOLE_THOUSAND_CENTS
  // Very small incomes: do not round down to zero.
  return rounded > 0 ? rounded : Math.floor(afterSavings)
}

/** Percentage of the income that stays free once the suggested budget is spent (whole number). */
export function leftoverPercent(incomeCents: Cents): number {
  if (incomeCents <= 0) return 0
  return Math.round(((incomeCents - suggestedBudgetCents(incomeCents)) / incomeCents) * 100)
}

/** A valid pay day (1 to 31) from free text, or null. */
export function parsePayDay(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const day = Number(text)
  return day >= 1 && day <= 31 ? day : null
}
