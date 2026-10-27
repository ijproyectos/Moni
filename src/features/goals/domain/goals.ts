import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

// Savings goals (Metas) — simulated feature, no backend yet.

export type GoalIconName = 'house' | 'banknote' | 'plane' | 'heart' | 'laptop' | 'gift' | 'target'

export type SplitMode = 'income' | 'half'

export interface Contribution {
  id: string
  label: string
  date: IsoDate
  source: string
  cents: Cents
}

export interface SharedGoalInfo {
  space: string
  partner: string
  split: SplitMode
  /** My share when splitting by income (0..1). */
  incomeShare: number
  mineCents: Cents
  theirsCents: Cents
  /** What each one put in this month. */
  monthMineCents: Cents
  monthTheirsCents: Cents
  inviteCode: string
  pending: boolean
}

export interface Goal {
  id: string
  name: string
  targetCents: Cents
  savedCents: Cents
  dueDate: IsoDate
  icon: GoalIconName
  contributions: Contribution[]
  shared?: SharedGoalInfo
}

/** Whole months from `today`'s month to the due month (at least 1). */
export function monthsUntil(today: IsoDate, due: IsoDate): number {
  const [ty, tm] = today.split('-').map(Number) as [number, number]
  const [dy, dm] = due.split('-').map(Number) as [number, number]
  return Math.max(1, dy * 12 + dm - (ty * 12 + tm))
}

/** Rounds a monthly amount up to the next $5.000 so the suggestion is easy to follow. */
export function roundUpSuggestion(cents: Cents): Cents {
  const step = 5_000 * 100
  return Math.ceil(cents / step) * step
}

/** How much to save per month to reach the goal by its due date. */
export function monthlyNeeded(
  goal: Pick<Goal, 'targetCents' | 'savedCents' | 'dueDate'>,
  today: IsoDate,
): Cents {
  const missing = Math.max(0, goal.targetCents - goal.savedCents)
  return roundUpSuggestion(missing / monthsUntil(today, goal.dueDate))
}

export function progress(goal: Pick<Goal, 'targetCents' | 'savedCents'>): number {
  return goal.targetCents > 0 ? Math.min(1, goal.savedCents / goal.targetCents) : 0
}

export function percentLabel(value: number): string {
  return `${Math.floor(value * 100)}%`
}

/** Splits a monthly amount between me and my partner. */
export function splitMonthly(total: Cents, mode: SplitMode, incomeShare: number): [Cents, Cents] {
  const mine = mode === 'half' ? total / 2 : Math.round(total * incomeShare)
  return [mine, total - mine]
}

/** Adds `months` calendar months to an ISO date, clamping the day to the month length. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

// ---- Installments comparison (¿Conviene en cuotas?) ----

export interface InstallmentOption {
  id: string
  kind: 'installments' | 'aguinaldo'
  count: number
  installmentCents: Cents
}

export function optionTotal(option: InstallmentOption, cashPrice: Cents): Cents {
  return option.kind === 'aguinaldo' ? cashPrice : option.count * option.installmentCents
}

/** Monthly effective rate implied by paying `count` installments instead of `price` cash (bisection). */
export function impliedMonthlyRate(price: Cents, count: number, installment: Cents): number {
  if (count * installment <= price) return 0
  const pv = (r: number) => installment * ((1 - (1 + r) ** -count) / r)
  let lo = 1e-6
  let hi = 1
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (pv(mid) > price) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function formatRate(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toLocaleString('es-AR')}%`
}
