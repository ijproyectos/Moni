import type { Cents } from '@/shared/lib/money'
import { daysInMonth, monthRange, type IsoDate } from '@/shared/lib/month'

// "Hoy podés gastar": what is left of the month once what is already committed is set aside, spread over the days that
// remain (today included). Pure and in integer cents; the caller decides which date is "today" (Argentina's calendar day).

/** Previous months used to estimate the income when the current month has not received it yet. */
export const INCOME_LOOKBACK_MONTHS = 3

/**
 * Expected income of the month, derived from what is already recorded (nothing is invented):
 * the larger of what came in so far this month and the average of the previous months that had income.
 * Returns null when there is no income anywhere ("sin-datos").
 */
export function expectedIncomeCents(
  monthIncomeCents: Cents,
  previousMonthsIncomeCents: readonly Cents[],
): Cents | null {
  const prior = previousMonthsIncomeCents.slice(0, INCOME_LOOKBACK_MONTHS).filter((c) => c > 0)
  const average = prior.length > 0 ? Math.round(prior.reduce((s, c) => s + c, 0) / prior.length) : 0
  const expected = Math.max(Math.max(0, monthIncomeCents), average)
  return expected > 0 ? expected : null
}

export interface DailyAllowanceInput {
  /** Calendar day in Argentina, "YYYY-MM-DD". */
  today: IsoDate
  /** From `expectedIncomeCents`; null when there is no income recorded. */
  expectedIncomeCents: Cents | null
  /** Fixed expenses still to be paid this month. */
  pendingFixedCents: Cents
  /** Subscription charges still to come this month. */
  pendingSubscriptionsCents: Cents
  /** Card installments still to come this month. */
  pendingInstallmentsCents: Cents
  /** What the goals still ask to set aside this month. */
  goalsCents: Cents
  /** Expenses of the month up to today. */
  spentCents: Cents
}

export interface DailyAllowanceData {
  kind: 'ok'
  today: IsoDate
  /** Day of the month (1-based) and length of the month. */
  dayOfMonth: number
  daysInMonth: number
  /** Days left including today. */
  daysLeft: number
  expectedIncomeCents: Cents
  /** Fixed + subscriptions + installments + goals still to cover. */
  committedCents: Cents
  /** Income minus commitments: what the month allows to spend in total (can be negative). */
  spendBudgetCents: Cents
  spentCents: Cents
  /** Budget minus spent (negative when the person already spent more). */
  remainingCents: Cents
  /** What can be spent today and each remaining day; 0 when nothing is left. */
  dailyCents: Cents
  /** How much was spent beyond the budget (0 when within it). */
  overCents: Cents
}

export type DailyAllowance = { kind: 'sin-datos' } | DailyAllowanceData

const nonNegative = (value: Cents) => Math.max(0, value)

export function dailyAllowance(input: DailyAllowanceInput): DailyAllowance {
  if (input.expectedIncomeCents === null || input.expectedIncomeCents <= 0) {
    return { kind: 'sin-datos' }
  }
  const total = daysInMonth(input.today)
  const dayOfMonth = Number(input.today.slice(8, 10))
  const daysLeft = Math.max(1, total - dayOfMonth + 1)
  const committedCents =
    nonNegative(input.pendingFixedCents) +
    nonNegative(input.pendingSubscriptionsCents) +
    nonNegative(input.pendingInstallmentsCents) +
    nonNegative(input.goalsCents)
  const spendBudgetCents = input.expectedIncomeCents - committedCents
  const spentCents = nonNegative(input.spentCents)
  const remainingCents = spendBudgetCents - spentCents
  return {
    kind: 'ok',
    today: input.today,
    dayOfMonth,
    daysInMonth: total,
    daysLeft,
    expectedIncomeCents: input.expectedIncomeCents,
    committedCents,
    spendBudgetCents,
    spentCents,
    remainingCents,
    dailyCents: remainingCents > 0 ? Math.floor(remainingCents / daysLeft) : 0,
    overCents: remainingCents < 0 ? -remainingCents : 0,
  }
}

/** Last day of the month containing `today`. */
export function monthEnd(today: IsoDate): IsoDate {
  return monthRange(today).to
}

/** Sums the amounts of the items whose date falls from `today` through the end of the month. */
export function sumDueThisMonth(
  items: readonly { date: IsoDate; amountCents: Cents }[],
  today: IsoDate,
): Cents {
  const end = monthEnd(today)
  return items
    .filter((i) => i.date >= today && i.date <= end)
    .reduce((sum, i) => sum + i.amountCents, 0)
}
