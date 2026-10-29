import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api/queryKeys'
import { useAuth } from '@/features/auth/api/authContext'
import { profileQueryKey } from '@/features/auth/api/useProfile'
import { categoryKeys } from '@/features/categories/api/queryKeys'
import { createCategory } from '@/features/categories/api/categoriesRepository'
import { getSupabase } from '@/shared/lib/supabase'
import { onboardingSchema, type OnboardingInput } from '../domain/onboarding'
import { saveLocalPreferences } from '../domain/localPreferences'

/** PostgREST answers PGRST202 (or Postgres 42883) when an RPC does not exist yet. */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

/**
 * Saves the onboarding: goals, chosen templates, custom categories, second currency and the
 * notifications answer, creates the default cash account and marks the profile as onboarded.
 * Uses the atomic `complete_onboarding_v2` when the proposed migration is applied; otherwise falls
 * back to `complete_onboarding` + client-side category creation and keeps preferences locally.
 * Idempotent: retrying after a failure never duplicates rows.
 */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: OnboardingInput) => {
      const values = onboardingSchema.parse(input)
      const supabase = getSupabase()

      const v2 = await supabase.rpc('complete_onboarding_v2', {
        p_goals: values.goals,
        p_template_slugs: values.templateSlugs,
        p_custom_categories: values.customCategories,
        p_secondary_currency: values.secondaryCurrency,
        p_notifications_opt_in: values.notificationsOptIn,
      })
      if (!v2.error) return
      if (!isMissingFunction(v2.error)) throw v2.error

      // Fallback while the migration is not applied. Custom categories go first: if one fails the
      // profile is still not onboarded and the person can retry (name clashes are skipped).
      for (const category of values.customCategories) {
        try {
          await createCategory(category)
        } catch (e) {
          if ((e as { code?: string }).code !== '23505') throw e
        }
      }
      const { error } = await supabase.rpc('complete_onboarding', {
        p_goals: values.goals,
        p_template_slugs: values.templateSlugs,
      })
      if (error) throw error
      if (user) {
        saveLocalPreferences(user.id, {
          secondaryCurrency: values.secondaryCurrency,
          notificationsOptIn: values.notificationsOptIn,
        })
      }
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) }),
        queryClient.invalidateQueries({ queryKey: categoryKeys.all(user?.id) }),
        queryClient.invalidateQueries({ queryKey: accountKeys.all(user?.id) }),
      ]),
  })
}
