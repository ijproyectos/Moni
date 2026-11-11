import { useMemo } from 'react'
import { monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { expectedIncomeCents, INCOME_LOOKBACK_MONTHS } from '../domain/dailyAllowance'
import type { Cents } from '@/shared/lib/money'
import { useMonthSummaries } from './useMonthSummary'

/**
 * Expected monthly income, from what is already recorded (see `expectedIncomeCents`). Null while loading or when no
 * income was recorded anywhere. Shares the month-summary cache with the rest of the dashboard.
 */
export function useExpectedIncome(): { isLoading: boolean; incomeCents: Cents | null } {
  const month = monthStart(todayIso())
  const months = useMemo(
    () => [month, ...Array.from({ length: INCOME_LOOKBACK_MONTHS }, (_, i) => shiftMonth(month, -(i + 1)))],
    [month],
  )
  const summaries = useMonthSummaries(months)
  const current = summaries[0]?.data
  const isLoading = summaries.some((q) => q.isLoading)
  const previousKey = summaries.slice(1).map((q) => q.data?.incomeCents ?? 0).join(',')
  const incomeCents = useMemo(
    () =>
      current
        ? expectedIncomeCents(current.incomeCents, previousKey.split(',').map(Number))
        : null,
    [current, previousKey],
  )
  return { isLoading, incomeCents }
}
