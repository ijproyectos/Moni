import type { Cents } from '@/shared/lib/money'
import { shiftMonth, type IsoDate } from '@/shared/lib/month'
import type { CategorySlice } from './monthSummary'

// Estadísticas: pure helpers over the summaries the dashboard already fetches.

export const SAVINGS_GOAL_PERCENT = 15
export const OTHER_ID = '__others__'

export interface LegendSlice {
  id: string
  name: string
  color: string | null
  amountCents: Cents
  /** Share of the total, 0..100 (one decimal is not shown: the legend rounds). */
  percent: number
}

/**
 * Top `top` categories by amount plus an "Otras N" slice with the rest. When the rest is a single category it is
 * shown as itself (an "Otras 1" would only hide a name). Percentages are against the sum of the slices.
 */
export function groupCategories(slices: readonly CategorySlice[], top = 4): LegendSlice[] {
  const sorted = slices.filter((s) => s.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents)
  const total = sorted.reduce((s, c) => s + c.amountCents, 0)
  if (total <= 0) return []
  const pct = (cents: Cents) => (cents / total) * 100
  const toLegend = (s: CategorySlice): LegendSlice => ({
    id: s.categoryId,
    name: s.name,
    color: s.color,
    amountCents: s.amountCents,
    percent: pct(s.amountCents),
  })
  if (sorted.length <= top + 1) return sorted.map(toLegend)
  const rest = sorted.slice(top)
  const restCents = rest.reduce((s, c) => s + c.amountCents, 0)
  return [
    ...sorted.slice(0, top).map(toLegend),
    {
      id: OTHER_ID,
      name: `Otras ${rest.length}`,
      color: null,
      amountCents: restCents,
      percent: pct(restCents),
    },
  ]
}

export interface MonthTotals {
  month: IsoDate
  incomeCents: Cents
  expenseCents: Cents
}

/** The `count` months ending at `latest`, oldest first. */
export function lastMonths(latest: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(latest, i - (count - 1)))
}

export interface SavingsSummary {
  /** Savings over income, as a percentage (can be negative). */
  percent: number
  /** Average monthly savings over the months with income in the period. */
  monthlyAverageCents: Cents
}

/** Savings of a period: (income - expenses) / income. Null when the period has no income. */
export function savingsSummary(months: readonly MonthTotals[]): SavingsSummary | null {
  const withIncome = months.filter((m) => m.incomeCents > 0)
  const income = withIncome.reduce((s, m) => s + m.incomeCents, 0)
  if (income <= 0) return null
  const expense = withIncome.reduce((s, m) => s + m.expenseCents, 0)
  return {
    percent: Math.round(((income - expense) / income) * 100),
    monthlyAverageCents: Math.round((income - expense) / withIncome.length),
  }
}

/** Bar heights (0..1) for expenses and incomes, scaled to the biggest value shown. */
export function barScale(months: readonly MonthTotals[]): { expense: number; income: number }[] {
  const max = Math.max(1, ...months.flatMap((m) => [m.expenseCents, m.incomeCents]))
  return months.map((m) => ({ expense: m.expenseCents / max, income: m.incomeCents / max }))
}

/** Adds the same category across several months (the "6 meses" and "Año" donuts). Percentages are recomputed. */
export function mergeCategories(months: readonly (readonly CategorySlice[])[]): CategorySlice[] {
  const byId = new Map<string, CategorySlice>()
  for (const slices of months) {
    for (const s of slices) {
      const known = byId.get(s.categoryId)
      byId.set(s.categoryId, known ? { ...known, amountCents: known.amountCents + s.amountCents } : { ...s })
    }
  }
  const merged = [...byId.values()]
  const total = merged.reduce((sum, s) => sum + Math.max(0, s.amountCents), 0)
  return merged.map((s) => ({ ...s, percent: total > 0 ? (Math.max(0, s.amountCents) / total) * 100 : 0 }))
}
