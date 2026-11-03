import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/shared/lib/supabase'
import { useAuth } from './authContext'

/**
 * Whether the signed-in account was suspended from the admin panel. The reason never reaches the app: the database
 * answers a boolean. A failed or offline check counts as "not suspended" (the auth ban still stops new sign-ins and
 * token refreshes, so a suspension takes hold as soon as the session renews).
 */
export function useAccountSuspended(): boolean {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['account', user?.id, 'suspended'],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('my_account_suspended')
      if (error) throw error
      return data
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    networkMode: 'online',
  })
  return query.data === true
}
