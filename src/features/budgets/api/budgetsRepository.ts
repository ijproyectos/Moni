import { fromCents, type Cents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import {
  parseBudgetStatus,
  parseBudgetSuggestions,
  type BudgetStatus,
  type BudgetSuggestion,
} from '../domain/budget'

const toNumeric = (cents: Cents) => Number(fromCents(cents))

export async function fetchBudgetStatus(month: string): Promise<BudgetStatus[]> {
  const { data, error } = await getSupabase().rpc('get_budget_status', { p_month: month })
  if (error) throw error
  return parseBudgetStatus(data)
}

export async function fetchBudgetSuggestions(): Promise<BudgetSuggestion[]> {
  const { data, error } = await getSupabase().rpc('suggest_budgets')
  if (error) throw error
  return parseBudgetSuggestions(data)
}

export async function createBudget(categoryId: string, amountCents: Cents): Promise<void> {
  const { error } = await getSupabase()
    .from('budgets')
    .insert({ category_id: categoryId, amount: toNumeric(amountCents) })
  if (error) throw error
}

export async function updateBudgetAmount(id: string, amountCents: Cents): Promise<void> {
  const { error } = await getSupabase()
    .from('budgets')
    .update({ amount: toNumeric(amountCents) })
    .eq('id', id)
  if (error) throw error
}

/** Budgets are never deleted: archiving frees the category for a new one. */
export async function archiveBudget(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('budgets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
