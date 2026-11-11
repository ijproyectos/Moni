import { expectedIncomeCents } from '@/features/dashboard/domain/dailyAllowance'
import type { BudgetStatus } from '@/features/budgets/domain/budget'
import type { Payment } from '@/features/fixedExpenses/domain/fixedExpense'
import type { SubscriptionCharge } from '@/features/subscriptions/domain/subscription'
import type { Transaction } from '@/features/transactions/domain/transaction'
import type { Cents } from '@/shared/lib/money'
import { type IsoDate } from '@/shared/lib/month'
import type { HealthMonthInput } from './healthScore'

export interface MonthFigures {
  incomeCents: Cents
  expenseCents: Cents
}

export interface HealthSources {
  /** Months to score, oldest first, "YYYY-MM-01". The last one is the current month. */
  months: readonly IsoDate[]
  /** Income and expenses per month, same order; undefined while a month has not loaded. */
  summaries: readonly (MonthFigures | undefined)[]
  /** Posted movements of the whole window (only the installment ones are used). */
  transactions: readonly Pick<Transaction, 'kind' | 'status' | 'amountCents' | 'occurredOn' | 'installmentPlanId'>[]
  fixedPayments: readonly Pick<Payment, 'status' | 'amountCents' | 'paidOn' | 'voidedElsewhere'>[]
  subscriptionCharges: readonly Pick<SubscriptionCharge, 'status' | 'amountCents' | 'dueOn' | 'voidedElsewhere'>[]
  /** True when the person has at least one fixed expense or subscription (even if nothing was paid in a month). */
  hasFixedOrSubscriptions: boolean
  /** Budget status per month, same order; undefined while loading. */
  budgets: readonly (readonly BudgetStatus[] | undefined)[]
}

const inMonth = (date: IsoDate, month: IsoDate) => date.slice(0, 7) === month.slice(0, 7)

/** Share (0..1) of budgets whose spending is within the limit; null without budgets. */
export function budgetCompliance(budgets: readonly Pick<BudgetStatus, 'state'>[] | undefined): number | null {
  if (!budgets || budgets.length === 0) return null
  return budgets.filter((b) => b.state !== 'over').length / budgets.length
}

/**
 * Turns what the app already knows into one HealthMonthInput per month:
 *  - income: the month's income; for the current month the expected income (larger of what came in and the average of the
 *    previous months), so a month that has not received its salary yet is not scored as if it had none;
 *  - installments: sum of the installment movements of the month, or null when the window has none;
 *  - fixed: fixed-expense payments + subscription charges posted in the month, or null when the person has none;
 *  - budget: share of budgets within their limit.
 * A month whose summary has not loaded yields no input.
 */
export function buildHealthInputs(src: HealthSources): HealthMonthInput[] {
  const installmentTx = src.transactions.filter(
    (t) => t.status === 'posted' && t.kind === 'expense' && t.installmentPlanId !== null,
  )
  const hasInstallments = installmentTx.length > 0
  const out: HealthMonthInput[] = []
  src.months.forEach((month, i) => {
    const figures = src.summaries[i]
    if (!figures) return
    const isCurrent = i === src.months.length - 1
    let income: Cents | null = figures.incomeCents > 0 ? figures.incomeCents : null
    if (isCurrent) {
      const previous = src.summaries
        .slice(0, i)
        .reverse()
        .map((s) => s?.incomeCents ?? 0)
      income = expectedIncomeCents(figures.incomeCents, previous)
    }
    const fixed = src.hasFixedOrSubscriptions
      ? src.fixedPayments
          .filter((p) => p.status === 'posted' && !p.voidedElsewhere && inMonth(p.paidOn, month))
          .reduce((s, p) => s + p.amountCents, 0) +
        src.subscriptionCharges
          .filter((c) => c.status === 'posted' && !c.voidedElsewhere && inMonth(c.dueOn, month))
          .reduce((s, c) => s + c.amountCents, 0)
      : null
    out.push({
      month,
      incomeCents: income,
      expenseCents: figures.expenseCents,
      installmentsCents: hasInstallments
        ? installmentTx.filter((t) => inMonth(t.occurredOn, month)).reduce((s, t) => s + t.amountCents, 0)
        : null,
      fixedCents: fixed,
      budgetCompliance: budgetCompliance(src.budgets[i]),
    })
  })
  return out
}
