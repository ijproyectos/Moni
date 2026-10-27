import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { profileQueryKey } from '@/features/auth/api/useProfile'
import { categoryKeys } from '@/features/categories/api/queryKeys'
import { getSupabase } from '@/shared/lib/supabase'
import { onboardingSchema, type OnboardingValues } from '../domain/onboarding'

/** Saves goals, copies the chosen category templates and creates the default cash account. Idempotent. */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (values: OnboardingValues) => {
      const parsed = onboardingSchema.parse(values)
      const { error } = await getSupabase().rpc('complete_onboarding', {
        p_goals: parsed.goals,
        p_template_slugs: parsed.templateSlugs,
      })
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) }),
        queryClient.invalidateQueries({ queryKey: categoryKeys.all(user?.id) }),
        queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      ]),
  })
}
