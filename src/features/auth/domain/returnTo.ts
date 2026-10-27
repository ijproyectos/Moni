// Remembers where a signed-out visitor was heading (e.g. an invite link) across the OAuth round trip.
// Google sign-in leaves the SPA, so router state would be lost; sessionStorage survives the redirect.

const KEY = 'moni:return-to'

/** Only same-origin app paths; never the auth screens themselves. */
export function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false
  return !['/auth', '/bienvenida', '/onboarding'].some(
    (blocked) => path === blocked || path.startsWith(`${blocked}/`),
  )
}

export function rememberReturnTo(path: string): void {
  if (path === '/' || !isSafeReturnPath(path)) return
  try {
    sessionStorage.setItem(KEY, path)
  } catch {
    // Storage can be blocked (private mode); the visitor just lands on Inicio after login.
  }
}

export function peekReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(KEY)
    return value && isSafeReturnPath(value) ? value : null
  } catch {
    return null
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
