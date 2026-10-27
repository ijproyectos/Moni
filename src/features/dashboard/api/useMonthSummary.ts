import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { monthStart, type IsoDate } from '@/shared/lib/month'
import { getSupabase } from '@/shared/lib/supabase'
import { parseMonthSummary } from '../domain/monthSummary'
import { dashboardKeys } from './queryKeys'

/** Dashboard data for the month containing `month` (any ISO date inside it). */
export function useMonthSummary(month: IsoDate) {
  const { user } = useAuth()
  const first = monthStart(month)

  return useQuery({
    queryKey: dashboardKeys.monthSummary(user?.id, first),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_month_summary', { p_month: first })
      if (error) throw error
      return parseMonthSummary(data)
    },
  })
}

/** Month summaries for several months at once (Tu año). Shares the cache with `useMonthSummary`. */
export function useMonthSummaries(months: readonly IsoDate[]) {
  const { user } = useAuth()
  return useQueries({
    queries: months.map((month) => {
      const first = monthStart(month)
      return {
        queryKey: dashboardKeys.monthSummary(user?.id, first),
        enabled: Boolean(user),
        queryFn: async () => {
          const { data, error } = await getSupabase().rpc('get_month_summary', { p_month: first })
          if (error) throw error
          return parseMonthSummary(data)
        },
      }
    }),
  })
}
