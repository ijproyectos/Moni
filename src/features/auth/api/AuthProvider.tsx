import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase } from '@/shared/lib/supabase'
import { AuthContext, type AuthState } from './authContext'
import { readStoredSession } from './storedSession'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
    let active = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        // Offline with an expired access token the refresh fails with a network error: that is not a
        // sign-out. Keep the stored login so cached data still shows; supabase-js refreshes it later.
        const offlineRefreshFailed = !data.session && error && isAuthRetryableFetchError(error)
        return offlineRefreshFailed ? readStoredSession() : data.session
      })
      .catch(() => (navigator.onLine ? null : readStoredSession()))
      .then((initial) => {
        if (!active) return
        setSession(initial)
        setIsLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, isLoading }),
    [session, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
