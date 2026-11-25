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

/** Apple exige este login si la app ya ofrece otro proveedor externo (Google) y se sube a la App Store. */
export async function signInWithApple(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'apple',
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

/**
 * After an account was deleted: closes the session on this device without asking the server (the account is already gone) and wipes
 * everything local that belonged to it: the query cache (memory and persisted), drafts, per-user keys, the assistant's memory, the
 * push subscription of this browser and any leftover credential. Only the theme choice of the device is kept.
 */
export async function wipeLocalAccountData(queryClient: QueryClient): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' })
  } catch {
    // The account no longer exists server-side: the local session is cleared below either way.
  }
  clearUserData(queryClient)
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    await (await registration?.pushManager.getSubscription())?.unsubscribe()
  } catch {
    // No push in this browser.
  }
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key === 'moni.theme') continue
      if (key.startsWith('moni') || key.startsWith('sb-')) window.localStorage.removeItem(key)
    }
    window.sessionStorage.clear()
  } catch {
    // Blocked storage: nothing to clear.
  }
}
