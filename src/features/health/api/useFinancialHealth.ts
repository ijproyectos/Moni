import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import { fetchBudgetStatus } from '@/features/budgets/api/budgetsRepository'
import { budgetKeys } from '@/features/budgets/api/queryKeys'
import { useMonthSummaries } from '@/features/dashboard/api/useMonthSummary'
import { lastMonths } from '@/features/dashboard/domain/stats'
import { useFixedExpenses } from '@/features/fixedExpenses/api/useFixedExpenses'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { useTransactions } from '@/features/transactions/api/useTransactions'
import { monthStart, todayIso } from '@/shared/lib/month'
import { buildHealthInputs } from '../domain/healthInputs'
import {
  computeHealthScore,
  healthSeries,
  scoreDelta,
  suggestImprovement,
  type HealthMonthInput,
  type HealthScore,
  type HealthSeriesPoint,
  type HealthSuggestion,
} from '../domain/healthScore'

export const HEALTH_MONTHS = 6

export interface FinancialHealth {
  isLoading: boolean
  /** Inputs of the current month (null while loading). */
  current: HealthMonthInput | null
  score: HealthScore
  /** Last six months, oldest first; months that cannot be scored have a null score. */
  series: HealthSeriesPoint[]
  /** Points against the previous month; null when it cannot be computed. */
  delta: number | null
  suggestion: HealthSuggestion | null
}

/** Thin glue: gathers the data the app already has and hands it to the pure score domain. */
export function useFinancialHealth(): FinancialHealth {
  const { user } = useAuth()
  const latest = monthStart(todayIso())
  const months = useMemo(() => lastMonths(latest, HEALTH_MONTHS), [latest])
  const summaries = useMonthSummaries(months)
  const transactions = useTransactions({ from: months[0], to: todayIso() })
  const fixed = useFixedExpenses()
  const subscriptions = useSubscriptions()
  const budgets = useQueries({
    queries: months.map((m) => ({
      queryKey: budgetKeys.status(user?.id, m),
      enabled: Boolean(user),
      queryFn: () => fetchBudgetStatus(m),
    })),
  })

  const currentSummary = summaries[HEALTH_MONTHS - 1]
  const isLoading =
    summaries.some((q) => q.isLoading) || transactions.isLoading || fixed.isLoading || subscriptions.isLoading

  return useMemo(() => {
    const inputs = buildHealthInputs({
      months,
      summaries: summaries.map((q) =>
        q.data ? { incomeCents: q.data.incomeCents, expenseCents: q.data.expenseCents } : undefined,
      ),
      transactions: transactions.data ?? [],
      fixedPayments: fixed.data?.payments ?? [],
      subscriptionCharges: subscriptions.data?.charges ?? [],
      hasFixedOrSubscriptions:
        (fixed.data?.expenses.some((e) => e.status !== 'removed') ?? false) ||
        (subscriptions.data?.subscriptions.some((s) => s.status !== 'cancelled') ?? false),
      budgets: budgets.map((q) => q.data),
    })
    const current = currentSummary?.data ? (inputs[inputs.length - 1] ?? null) : null
    // The series needs a slot per month so the bars keep their place even when a month has no score.
    const byMonth = new Map(healthSeries(inputs).map((p) => [p.month, p]))
    const series = months.map((m) => byMonth.get(m) ?? { month: m, score: null })
    return {
      isLoading,
      current,
      score: current ? computeHealthScore(current) : ({ kind: 'sin-datos' } as HealthScore),
      series,
      delta: scoreDelta(series),
      suggestion: current ? suggestImprovement(current) : null,
    }
  }, [months, summaries, transactions.data, fixed.data, subscriptions.data, budgets, currentSummary?.data, isLoading])
}
