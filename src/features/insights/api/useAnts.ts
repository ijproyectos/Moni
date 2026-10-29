import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { monthStart, type IsoDate } from '@/shared/lib/month'
import { getSupabase } from '@/shared/lib/supabase'
import { parseAntExpenses } from '../domain/ants'

// Under the 'dashboard' prefix so every transaction mutation (which invalidates dashboardKeys.all) refreshes it.
export const antKeys = {
  month: (userId: string | undefined, month: string) =>
    ['dashboard', userId, 'ants', month] as const,
}

/** Gastos hormiga of the month containing `month`, with the default threshold chosen by the database. */
export function useAnts(month: IsoDate) {
  const { user } = useAuth()
  const first = monthStart(month)
  return useQuery({
    queryKey: antKeys.month(user?.id, first),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_ant_expenses', { p_month: first })
      if (error) throw error
      return parseAntExpenses(data)
    },
  })
}
