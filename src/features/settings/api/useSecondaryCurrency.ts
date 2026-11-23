import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { profileQueryKey, useProfile } from '@/features/auth/api/useProfile'
import { loadLocalPreferences, mergeLocalPreferences } from '@/features/onboarding/domain/localPreferences'
import { getSupabase } from '@/shared/lib/supabase'

/**
 * Whether the person also uses dollars (USD) next to pesos, which are always the main currency. It lives in the profile
 * (`secondary_currency`); a device copy covers the databases that do not have the column yet. Turning it on only enables the
 * dollar options (Ahorros): nothing is converted and the two currencies are never mixed.
 */
export function useSecondaryCurrency() {
  const { user } = useAuth()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const local = user ? loadLocalPreferences(user.id) : null
  const usesUsd = (profile.data?.secondary_currency ?? local?.secondaryCurrency) === 'USD'

  const set = useMutation({
    mutationFn: async (on: boolean) => {
      if (!user) throw new Error('Not authenticated')
      const value = on ? 'USD' : null
      const { error } = await getSupabase().from('profiles').update({ secondary_currency: value }).eq('id', user.id)
      mergeLocalPreferences(user.id, { secondaryCurrency: value })
      // Without the column (migration not applied) the device copy is what counts.
      if (error && error.code !== '42703' && error.code !== 'PGRST204') throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) }),
  })

  return { usesUsd, isLoading: profile.isLoading, setUsesUsd: set.mutateAsync, isSaving: set.isPending }
}
