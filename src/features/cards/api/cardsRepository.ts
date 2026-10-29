import { toTransaction } from '@/features/transactions/api/transactionsRepository'
import type { Transaction } from '@/features/transactions/domain/transaction'
import { fromCents, toCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { getSupabase } from '@/shared/lib/supabase'
import { parseCardOverview, type CardOverview } from '../domain/overview'
import type { PlanInstallmentRow, PlanRow } from '../domain/plans'

/** Debt, available credit and statements of a card, computed by the database. Null if it is not a card of the caller. */
export async function getCardOverview(accountId: string): Promise<CardOverview | null> {
  const { data, error } = await getSupabase().rpc('get_card_overview', { p_account: accountId })
  if (error) throw error
  return parseCardOverview(data)
}

/** Movements of one statement (purchases and installments), oldest first. */
export async function listStatementItems(
  accountId: string,
  closingOn: IsoDate,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'posted')
    .eq('statement_closing_on', closingOn)
    .order('occurred_on', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(toTransaction)
}

/** Active installment purchases with the installments that were recorded for each. */
export async function listInstallmentPlanRows(): Promise<{
  plans: PlanRow[]
  installments: PlanInstallmentRow[]
}> {
  const supabase = getSupabase()
  const [plans, installments] = await Promise.all([
    supabase
      .from('installment_plans')
      .select('id, account_id, description, total_amount, installments_count, first_number')
      .eq('status', 'posted')
      .order('created_at', { ascending: true }),
    supabase
      .from('transactions')
      .select('installment_plan_id, installment_number, amount, occurred_on')
      .not('installment_plan_id', 'is', null)
      .eq('status', 'posted'),
  ])
  if (plans.error) throw plans.error
  if (installments.error) throw installments.error
  return {
    plans: plans.data.map((p) => ({
      id: p.id,
      accountId: p.account_id,
      description: p.description,
      totalCents: toCents(p.total_amount),
      count: p.installments_count,
      firstNumber: p.first_number,
    })),
    installments: installments.data.flatMap((t) =>
      t.installment_plan_id && t.installment_number
        ? [
            {
              planId: t.installment_plan_id,
              number: t.installment_number,
              amountCents: toCents(t.amount),
              closingOn: t.occurred_on,
            },
          ]
        : [],
    ),
  }
}

export interface InstallmentPurchaseInput {
  accountId: string
  description: string
  categoryId: string
  totalCents: Cents
  count: number
  /** "Voy en la N". */
  currentNumber: number
  /** Statement of the first recorded installment; null lets the database use the default one. */
  firstClosing: IsoDate | null
  /** Same key on a retry returns the purchase that already exists instead of creating another. */
  requestKey: string
}

export async function createInstallmentPurchase(input: InstallmentPurchaseInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_installment_purchase', {
    p_account: input.accountId,
    p_description: input.description,
    p_category: input.categoryId,
    p_total: Number(fromCents(input.totalCents)),
    p_count: input.count,
    p_current_number: input.currentNumber,
    p_first_closing: input.firstClosing,
    p_request_key: input.requestKey,
  })
  if (error) throw error
  return data
}

/** Voids the whole purchase: the plan and every one of its installments. */
export async function voidInstallmentPlan(planId: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('void_installment_plan', { p_plan: planId })
  if (error) throw error
  return data ?? 0
}
