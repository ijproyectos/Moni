import type { QueryClient } from '@tanstack/react-query'
import { clearAllDrafts } from '@/features/onboarding/domain/localPreferences'
import { clearPersistedCache } from '@/shared/lib/persistedCache'
import { getSupabase } from '@/shared/lib/supabase'

export const AUTH_CALLBACK_PATH = '/auth/callback'

export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}` },
  })
  if (error) throw error
}

/** Signs out and wipes everything cached for the account so the next one starts clean. */
export async function signOut(queryClient: QueryClient): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
  clearUserData(queryClient)
}

/** Clears the query cache (memory and persisted copy) and per-user local data; device prefs (hidden amounts) are kept. */
export function clearUserData(queryClient: QueryClient): void {
  queryClient.clear()
  void clearPersistedCache()
  clearAllDrafts()
}
