/**
 * Dismissing the due-dates notice on Home. The dismissal is stored per user and only holds for the exact set
 * of reminders and the day it was closed: a different set or a new day shows the notice again.
 */
export function reminderSignature(keys: readonly string[], today: string): string {
  return `${today}|${[...keys].sort().join(',')}`
}

export const dismissalStorageKey = (userId: string) =>
  `moni:recurring-reminders-dismissed:${userId}`

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readDismissal(userId: string): string | null {
  try {
    return store()?.getItem(dismissalStorageKey(userId)) ?? null
  } catch {
    return null
  }
}

/** Returns false when storage is unavailable (the caller still hides the notice for this session). */
export function writeDismissal(userId: string, signature: string): boolean {
  try {
    const s = store()
    if (!s) return false
    s.setItem(dismissalStorageKey(userId), signature)
    return true
  } catch {
    return false
  }
}
