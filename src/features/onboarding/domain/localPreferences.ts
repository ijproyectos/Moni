// Fallback storage for onboarding preferences while the database has no columns for them, plus the
// in-progress onboarding draft (so a reload or the browser back button does not lose answers).
import type { CustomCategory } from './onboarding'

export interface LocalPreferences {
  secondaryCurrency: 'USD' | null
  notificationsOptIn: boolean | null
}

export interface OnboardingDraft {
  goals: string[]
  slugs: string[] | null
  custom: CustomCategory[]
  usesDollars: boolean
  notificationsOptIn: boolean | null
}

const prefsKey = (userId: string) => `moni:prefs:${userId}`
const draftKey = (userId: string) => `moni:onboarding-draft:${userId}`

function read<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(storage: Storage | undefined, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: answers simply are not kept.
  }
}

const local = () => (typeof window === 'undefined' ? undefined : window.localStorage)
const session = () => (typeof window === 'undefined' ? undefined : window.sessionStorage)

export function saveLocalPreferences(userId: string, prefs: LocalPreferences) {
  write(local(), prefsKey(userId), prefs)
}

export function loadLocalPreferences(userId: string): LocalPreferences | null {
  return read<LocalPreferences>(local(), prefsKey(userId))
}

export function saveDraft(userId: string, draft: OnboardingDraft) {
  write(session(), draftKey(userId), draft)
}

export function loadDraft(userId: string): OnboardingDraft | null {
  const draft = read<OnboardingDraft>(session(), draftKey(userId))
  if (!draft || !Array.isArray(draft.goals) || !Array.isArray(draft.custom)) return null
  return draft
}

export function clearDraft(userId: string) {
  try {
    session()?.removeItem(draftKey(userId))
  } catch {
    // ignore
  }
}
