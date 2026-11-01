import type { QueryClient } from '@tanstack/react-query'
import { rememberReturnTo } from '@/features/auth/domain/returnTo'
import { AUTH_CALLBACK_PATH, clearUserData } from '@/features/auth/api/authActions'
import { getSupabase } from '@/shared/lib/supabase'
import { ADMIN_PATH } from '../domain/paths'

/**
 * Google sign-in that comes back to /adminmoni. It reuses the app's own OAuth callback (already in the redirect
 * allowlist) and remembers the destination, so no extra redirect URL has to be configured in Supabase.
 * `selectAccount` forces Google's account chooser (to switch to another account).
 */
export async function signInAdminWithGoogle(selectAccount = false): Promise<void> {
  rememberReturnTo(ADMIN_PATH)
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      ...(selectAccount ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  })
  if (error) throw error
}

/** Local sign-out only (other devices keep their session) and wipes everything cached for the account. */
export async function signOutAdmin(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ queryKey: ['admin'] })
  await getSupabase().auth.signOut({ scope: 'local' })
  clearUserData(queryClient)
}
