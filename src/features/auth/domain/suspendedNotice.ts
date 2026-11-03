const KEY = 'moni.suspended-notice'

/**
 * The OAuth round trip of a suspended account ends at /auth/callback with `error_code=user_banned`. The notice is
 * handed to the welcome screen through sessionStorage (the redirect between them carries no state we control).
 */
export function isBannedCallback(search: string, hash: string): boolean {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  return query.get('error_code') === 'user_banned' || fragment.get('error_code') === 'user_banned'
}

export function markSuspendedNotice(): void {
  try {
    window.sessionStorage.setItem(KEY, '1')
  } catch {
    // Without storage the welcome screen just shows its usual text.
  }
}

export function readSuspendedNotice(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function clearSuspendedNotice(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
