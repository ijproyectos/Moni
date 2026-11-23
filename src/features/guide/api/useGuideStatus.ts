import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { profileQueryKey, useProfile } from '@/features/auth/api/useProfile'
import { getSupabase } from '@/shared/lib/supabase'

export type GuideStatus = 'completed' | 'skipped'

/** PostgREST answers PGRST202 (or Postgres 42883) when the function does not exist yet (migration not applied). */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

/**
 * Whether the person already completed or skipped the tour, kept in their profile (Supabase) so it is not shown by itself again on
 * any device. While the migration is not applied the device copy (see domain/guide) is what counts.
 */
export function useGuideStatus() {
  const { user } = useAuth()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async (status: GuideStatus) => {
      const { error } = await getSupabase().rpc('set_guide_status', { p_status: status })
      if (error && !isMissingFunction(error)) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) }),
  })
  return { status: profile.data?.guide_status ?? null, loaded: profile.isSuccess, save: save.mutateAsync }
}
