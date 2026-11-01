// Inactivity rule for the admin session: sign out after 30 minutes without activity.

export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000
export const INACTIVITY_CHECK_MS = 30 * 1000
export const ACTIVITY_STORAGE_KEY = 'moni:admin:last-activity'

/** True when more than `limitMs` passed since the last activity. A missing record is not expired. */
export function isExpired(
  lastActivityMs: number | null,
  nowMs: number,
  limitMs: number = INACTIVITY_LIMIT_MS,
): boolean {
  if (lastActivityMs === null || !Number.isFinite(lastActivityMs)) return false
  return nowMs - lastActivityMs > limitMs
}

export function msUntilExpiry(
  lastActivityMs: number,
  nowMs: number,
  limitMs: number = INACTIVITY_LIMIT_MS,
): number {
  return Math.max(0, lastActivityMs + limitMs - nowMs)
}

export function readLastActivity(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export function writeLastActivity(nowMs: number): void {
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(nowMs))
  } catch {
    // Storage can be blocked; the in-memory timer still enforces the limit while the tab is open.
  }
}

export function clearLastActivity(): void {
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}
