import { useQuery } from '@tanstack/react-query'
import type { Profile } from '@/shared/lib/database.types'
import { getSupabase } from '@/shared/lib/supabase'
import { useAuth } from './authContext'

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const

export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: profileQueryKey(user?.id),
    enabled: Boolean(user),
    queryFn: async (): Promise<Profile> => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data
    },
  })
}
