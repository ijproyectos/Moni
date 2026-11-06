import { useContext, useMemo } from 'react'
import { AuthContext } from '@/features/auth/api/authContext'
import { useBudgetStatus } from '@/features/budgets/api/useBudgets'
import { usePendingDebts, useUnreadNoticeCount } from '@/features/debts/api/useDebts'
import { BADGES } from '@/features/goals/domain/badges'
import {
  useRewards,
  useSavings,
  useSavingsNoticeCount,
  useSavingsPlanData,
} from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { planNow } from '@/features/goals/domain/savingsPlan'
import { useRecurringReminders } from '@/features/recurring/api/useRecurringReminders'
import { readDismissal, reminderSignature } from '@/features/recurring/domain/reminderDismissal'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { FEATURES } from '@/shared/config/features'
import { formatMonthName } from '@/shared/lib/dates'
import { daysInMonth, monthStart, shiftMonth, todayIso, type IsoDate } from '@/shared/lib/month'
import { buildStories, type Story } from '../domain/stories'
import type { MonthSummary } from '../domain/monthSummary'
import { useMonthSummary } from './useMonthSummary'

/** The stories of Inicio for a month (the current one), from the person's real data (see `buildStories`). */
export function useHomeStories(month: IsoDate, summary: MonthSummary): Story[] {
  const latestMonth = monthStart(todayIso())
  const userId = useContext(AuthContext)?.user?.id ?? 'anonymous'
  const today = todayIso()
  const previousMonth = shiftMonth(month, -1)
  const previous = useMonthSummary(previousMonth)
  const debts = usePendingDebts()
  const subscriptions = useSubscriptions()
  const budgets = useBudgetStatus(month)
  const savings = useSavings()
  const planData = useSavingsPlanData()
  const rewards = useRewards()
  const reminders = useRecurringReminders()
  const savingsNoticeCount = useSavingsNoticeCount()
  const groupNoticeCount = useUnreadNoticeCount()

  return useMemo(() => {
    const dismissed =
      readDismissal(userId) ===
      reminderSignature(
        reminders.map((r) => r.key),
        today,
      )
    const openReminders = dismissed ? [] : reminders
    const goals = savings.data?.goals ?? []
    const totals = activeTotals(goals)
    return buildStories({
      today,
      monthName: formatMonthName(month).toLowerCase(),
      reminders: openReminders,
      savingsNoticeCount,
      groupNoticeCount,
      noticesPath: FEATURES.notifications ? '/avisos' : '/grupos/avisos',
      debts: debts.debts,
      debtsPath: FEATURES.debts ? '/deudas' : '/grupos',
      spending: {
        expenseCents: summary.expenseCents,
        byCategory: summary.byCategory,
        // Only whole months are compared: a month still running would always look cheaper.
        previousExpenseCents:
          month < latestMonth && previous.data ? previous.data.expenseCents : null,
        previousMonthName: formatMonthName(previousMonth).toLowerCase(),
        daysCounted:
          month === latestMonth
            ? Number(today.slice(8, 10))
            : month < latestMonth
              ? daysInMonth(month)
              : undefined,
      },
      goals: {
        plan:
          savings.data && planData.data
            ? planNow({ today: savings.data.today, goals, data: planData.data })
            : null,
        reservedCents: totals.reservedCents,
        targetCents: totals.targetCents,
        count: totals.count,
      },
      subscriptions: (subscriptions.data?.subscriptions ?? []).filter((s) => s.status === 'active'),
      budgets: budgets.data ?? [],
      badges: (rewards.data?.badges ?? []).map((b) => ({
        key: b.key,
        name: BADGES.find((d) => d.key === b.key)?.name ?? 'Nueva insignia',
        earnedOn: b.earnedAt.slice(0, 10),
      })),
    })
  }, [
    userId,
    today,
    month,
    latestMonth,
    previousMonth,
    summary,
    previous.data,
    debts.debts,
    subscriptions.data,
    budgets.data,
    savings.data,
    planData.data,
    rewards.data,
    reminders,
    savingsNoticeCount,
    groupNoticeCount,
  ])
}
