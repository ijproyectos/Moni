import type { Session } from '@supabase/supabase-js'

/**
 * The session supabase-js keeps in localStorage (`sb-<project>-auth-token`). When the access token
 * has expired and there is no connection, `getSession()` cannot refresh it and reports no session;
 * the stored one is still the person's login and must not send them to the welcome screen.
 */
export function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue
      const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')
      if (isSession(parsed)) return parsed
    }
  } catch {
    // Storage blocked or corrupt: treat as signed out.
  }
  return null
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const { access_token: token, refresh_token: refresh, user } = value as Record<string, unknown>
  return (
    typeof token === 'string' &&
    typeof refresh === 'string' &&
    typeof user === 'object' &&
    user !== null &&
    typeof (user as { id?: unknown }).id === 'string'
  )
}
