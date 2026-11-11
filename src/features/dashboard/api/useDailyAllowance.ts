import { useMemo } from 'react'
import { useInstallmentViews } from '@/features/cards/api/useInstallmentViews'
import { pendingBills, splitPendingBills, upcomingExpenses } from '@/features/fixedExpenses/domain/fixedExpense'
import { useFixedExpenses } from '@/features/fixedExpenses/api/useFixedExpenses'
import { useSavings, useSavingsPlanData } from '@/features/goals/api/useSavings'
import { planNow } from '@/features/goals/domain/savingsPlan'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { argentinaTodayIso, monthStart, shiftMonth } from '@/shared/lib/month'
import {
  dailyAllowance,
  expectedIncomeCents,
  monthEnd,
  sumDueThisMonth,
  type DailyAllowance,
} from '../domain/dailyAllowance'
import { dayStatus, monthPace, type DayStatus, type MonthPace } from '../domain/monthPace'
import { INCOME_LOOKBACK_MONTHS } from '../domain/dailyAllowance'
import { useMonthSummaries } from './useMonthSummary'

export interface DailyAllowanceView {
  isLoading: boolean
  allowance: DailyAllowance
  status: DayStatus | null
  pace: MonthPace | null
}

/** Thin glue: gathers the existing data and hands it to the pure domain. Nothing is calculated here. */
export function useDailyAllowance(now?: Date): DailyAllowanceView {
  const today = argentinaTodayIso(now)
  const month = monthStart(today)
  const months = useMemo(
    () => [month, ...Array.from({ length: INCOME_LOOKBACK_MONTHS }, (_, i) => shiftMonth(month, -(i + 1)))],
    [month],
  )
  const summaries = useMonthSummaries(months)
  const fixed = useFixedExpenses()
  const subscriptions = useSubscriptions()
  const installments = useInstallmentViews()
  const savings = useSavings()
  const plan = useSavingsPlanData()

  const current = summaries[0]?.data
  const isLoading =
    summaries[0]?.isLoading === true ||
    fixed.isLoading ||
    subscriptions.isLoading ||
    installments.isLoading ||
    savings.isLoading

  return useMemo(() => {
    if (!current) return { isLoading, allowance: { kind: 'sin-datos' }, status: null, pace: null }
    const previous = summaries.slice(1).map((q) => q.data?.incomeCents ?? 0)

    const end = monthEnd(today)
    const bills = fixed.data ? splitPendingBills(pendingBills(fixed.data)).active : []
    const pendingFixedCents =
      bills
        .filter((b) => b.date <= end)
        .reduce((sum, b) => sum + b.occurrence.expectedCents, 0) +
      (fixed.data
        ? sumDueThisMonth(
            upcomingExpenses(fixed.data.expenses).map((e) => ({
              date: e.nextDueOn,
              amountCents: e.amountCents,
            })),
            today,
          )
        : 0)
    const pendingSubscriptionsCents = sumDueThisMonth(
      (subscriptions.data?.subscriptions ?? [])
        .filter((s) => s.status === 'active')
        .map((s) => ({ date: s.nextChargeOn, amountCents: s.amountCents })),
      today,
    )
    const goalsCents =
      savings.data && plan.data
        ? planNow({ today, goals: savings.data.goals, data: plan.data }).missingCents
        : 0

    const allowance = dailyAllowance({
      today,
      expectedIncomeCents: expectedIncomeCents(current.incomeCents, previous),
      pendingFixedCents,
      pendingSubscriptionsCents,
      pendingInstallmentsCents: installments.monthlyCents,
      goalsCents,
      spentCents: current.expenseCents,
    })
    return {
      isLoading,
      allowance,
      status: dayStatus(allowance),
      pace: allowance.kind === 'ok' ? monthPace(allowance) : null,
    }
  }, [current, summaries, fixed.data, subscriptions.data, installments.monthlyCents, savings.data, plan.data, today, isLoading])
}
