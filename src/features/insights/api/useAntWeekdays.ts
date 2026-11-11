import { useMemo } from 'react'
import { useCategories } from '@/features/categories/api/useCategories'
import { useTransactions } from '@/features/transactions/api/useTransactions'
import { monthRange, monthStart, type IsoDate } from '@/shared/lib/month'
import type { AntExpenses } from '../domain/ants'
import { antsByWeekday } from '../domain/antsPatterns'

/** Ant purchases per weekday (Monday = 0) for the month, from the month's own movements. Null until they load. */
export function useAntWeekdays(ants: AntExpenses | undefined, month: IsoDate): number[] | null {
  const range = monthRange(monthStart(month))
  const transactions = useTransactions({ kind: 'expense', ...range })
  const categories = useCategories('expense')
  return useMemo(() => {
    if (!ants || !transactions.data) return null
    const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]))
    return antsByWeekday(ants, transactions.data, names)
  }, [ants, transactions.data, categories.data])
}
