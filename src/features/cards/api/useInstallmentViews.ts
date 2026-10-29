import { useMemo } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { todayIso } from '@/shared/lib/month'
import { buildPlanViews } from '../domain/plans'
import { useInstallmentPlanRows } from './useCards'

/** Installment purchases still running, ready to show: paid, per-month amount, what is left, end month. */
export function useInstallmentViews() {
  const rows = useInstallmentPlanRows()
  const accounts = useAccounts()
  const views = useMemo(() => {
    if (!rows.data) return []
    const dueDays = new Map((accounts.data ?? []).map((a) => [a.id, a.dueDay]))
    return buildPlanViews({
      plans: rows.data.plans,
      installments: rows.data.installments,
      dueDayByAccount: dueDays,
      today: todayIso(),
    }).filter((v) => v.remainingCents > 0)
  }, [rows.data, accounts.data])
  const monthlyCents = views.reduce((sum, v) => sum + v.installmentCents, 0)
  return { views, monthlyCents, isLoading: rows.isLoading, isError: rows.isError }
}
