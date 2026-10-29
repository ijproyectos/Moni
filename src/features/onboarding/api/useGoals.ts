import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { profileQueryKey, useProfile } from '@/features/auth/api/useProfile'
import { useMyGroups } from '@/features/groups/api/useGroups'
import type { Profile } from '@/shared/lib/database.types'
import { getSupabase } from '@/shared/lib/supabase'
import { featuresForGoals, sanitizeGoals, type AppFeature } from '../domain/goals'

/**
 * Sections enabled by the goals saved in the profile. Hidden sections stay reachable by URL and
 * from "Más herramientas"; groups also stay visible when the person already belongs to one.
 */
export function useEnabledFeatures(): { has: (feature: AppFeature) => boolean; isReady: boolean } {
  const { data: profile, isSuccess } = useProfile()
  const groups = useMyGroups()
  const enabled = featuresForGoals(profile?.goals)
  if ((groups.data?.length ?? 0) > 0) enabled.add('groups')
  // Until the profile loads, show everything rather than flashing a reduced app.
  return { has: (f) => !isSuccess || enabled.has(f), isReady: isSuccess }
}

/** Saves the goals chosen in Perfil. Only known goal ids are stored. */
export function useUpdateGoals() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (goals: readonly string[]) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await getSupabase()
        .from('profiles')
        .update({ goals: sanitizeGoals(goals) })
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: (_, goals) => {
      queryClient.setQueryData<Profile>(profileQueryKey(user?.id), (p) =>
        p ? { ...p, goals: sanitizeGoals(goals) } : p,
      )
      return queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) })
    },
  })
}
