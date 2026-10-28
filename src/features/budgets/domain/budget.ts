import { z } from 'zod'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { toCents, type Cents } from '@/shared/lib/money'

// Shapes returned by public.get_budget_status and public.suggest_budgets (see docs/SPRINT_5.md).
const cents = z.number().transform((value) => toCents(value))

export type BudgetState = 'ok' | 'warning' | 'over'

const statusSchema = z.array(
  z.object({
    budget_id: z.string(),
    category_id: z.string(),
    name: z.string(),
    color: z.string(),
    icon: z.string(),
    amount: cents,
    spent: cents,
    remaining: cents,
    percent: z.number(),
    state: z.enum(['ok', 'warning', 'over']),
  }),
)

const suggestionsSchema = z.array(
  z.object({
    category_id: z.string(),
    name: z.string(),
    color: z.string(),
    icon: z.string(),
    suggested_amount: cents,
    months_with_data: z.number().int(),
  }),
)

export interface BudgetStatus {
  budgetId: string
  categoryId: string
  name: string
  color: string
  icon: string
  amountCents: Cents
  spentCents: Cents
  /** Negative when over the limit. */
  remainingCents: Cents
  percent: number
  state: BudgetState
}

export interface BudgetSuggestion {
  categoryId: string
  name: string
  color: string
  icon: string
  suggestedCents: Cents
  monthsWithData: number
}

export function parseBudgetStatus(payload: unknown): BudgetStatus[] {
  return statusSchema.parse(payload).map((b) => ({
    budgetId: b.budget_id,
    categoryId: b.category_id,
    name: b.name,
    color: b.color,
    icon: b.icon,
    amountCents: b.amount,
    spentCents: b.spent,
    remainingCents: b.remaining,
    percent: b.percent,
    state: b.state,
  }))
}

export function parseBudgetSuggestions(payload: unknown): BudgetSuggestion[] {
  return suggestionsSchema.parse(payload).map((s) => ({
    categoryId: s.category_id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    suggestedCents: s.suggested_amount,
    monthsWithData: s.months_with_data,
  }))
}

/** Budgets that need attention (80% or more), most pressing first. */
export function budgetAlerts(budgets: readonly BudgetStatus[]): BudgetStatus[] {
  return budgets
    .filter((b) => b.state !== 'ok')
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'es'))
}

export function budgetByCategory(budgets: readonly BudgetStatus[]): Map<string, BudgetStatus> {
  return new Map(budgets.map((b) => [b.categoryId, b]))
}

/** Short badge copy for category lists. */
export function budgetBadge(budget: BudgetStatus): string {
  if (budget.state === 'over') return 'Te pasaste'
  if (budget.state === 'warning') return `Vas por el ${Math.floor(budget.percent)}%`
  return `${Math.floor(budget.percent)}% del límite`
}

/** Parses the limit typed in the category form. Empty means "no limit" (null); invalid or zero is an error. */
export function parseBudgetLimit(text: string): { ok: true; cents: Cents | null } | { ok: false } {
  if (text.trim() === '') return { ok: true, cents: null }
  const cents = parseAmountInput(text)
  if (cents === null || cents <= 0) return { ok: false }
  return { ok: true, cents }
}
