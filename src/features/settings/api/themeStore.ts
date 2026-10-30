import {
  applyTheme,
  parseThemeMode,
  readStoredThemeMode,
  resolveTheme,
  storeThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from '../domain/theme'

interface ThemeEnvironment {
  /** `null` when storage is unavailable (access itself may throw). */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  /** `null` when matchMedia is unavailable: the system is then treated as light. */
  media: {
    readonly matches: boolean
    addEventListener: (type: 'change', listener: () => void) => void
    removeEventListener: (type: 'change', listener: () => void) => void
  } | null
  doc: Document
}

export interface ThemeStore {
  getMode: () => ThemeMode
  getResolved: () => ResolvedTheme
  setMode: (mode: ThemeMode) => void
  subscribe: (listener: () => void) => () => void
  /** Applies the theme and follows OS changes while the mode is `system`. Returns the cleanup. */
  start: () => () => void
}

/** Holds the device's appearance mode and keeps <html> in sync with it and with the OS preference. */
export function createThemeStore(env: ThemeEnvironment): ThemeStore {
  let mode: ThemeMode = readStoredThemeMode(env.storage)
  const listeners = new Set<() => void>()

  const getResolved = () => resolveTheme(mode, env.media?.matches ?? false)
  const sync = () => {
    applyTheme(getResolved(), env.doc)
    listeners.forEach((listener) => listener())
  }

  return {
    getMode: () => mode,
    getResolved,
    setMode(next) {
      mode = parseThemeMode(next)
      storeThemeMode(env.storage, mode)
      sync()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      applyTheme(getResolved(), env.doc)
      const onSystemChange = () => {
        if (mode === 'system') sync()
      }
      env.media?.addEventListener('change', onSystemChange)
      return () => env.media?.removeEventListener('change', onSystemChange)
    },
  }
}

function safeStorage(): ThemeEnvironment['storage'] {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The app-wide store, bound to the real window. */
export const themeStore = createThemeStore({
  storage: safeStorage(),
  media:
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null,
  doc: document,
})
