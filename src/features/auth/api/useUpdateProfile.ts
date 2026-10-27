import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/shared/lib/supabase'
import { useAuth } from './authContext'
import { profileQueryKey } from './useProfile'

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (displayName: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await getSupabase()
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) }),
  })
}
