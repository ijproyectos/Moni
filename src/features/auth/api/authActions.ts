import { getSupabase } from '@/shared/lib/supabase'

export const AUTH_CALLBACK_PATH = '/auth/callback'

export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}` },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
}
