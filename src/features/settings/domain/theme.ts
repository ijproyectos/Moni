/** Appearance preference of this device. `system` follows the OS (prefers-color-scheme). */
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']
export const DEFAULT_THEME_MODE: ThemeMode = 'system'

/** Keep in sync with the inline script in index.html, which runs before the first paint. */
export const THEME_STORAGE_KEY = 'moni.theme'

/** Browser chrome color (<meta name="theme-color">) per resolved theme: forest in light, canvas in dark. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#064735',
  dark: '#0c1914',
}

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
}

/** Anything that is not a known mode (missing, corrupted, old value) falls back to `system`. */
export function parseThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.find((mode) => mode === value) ?? DEFAULT_THEME_MODE
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  return mode
}

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

/** Reads the saved mode. Storage can throw (private mode, blocked site data): that means "not saved". */
export function readStoredThemeMode(storage: ReadableStorage | null): ThemeMode {
  try {
    return parseThemeMode(storage?.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME_MODE
  }
}

/** Returns false when the choice could not be saved; the app keeps working with it for this session. */
export function storeThemeMode(storage: WritableStorage | null, mode: ThemeMode): boolean {
  try {
    if (!storage) return false
    storage.setItem(THEME_STORAGE_KEY, mode)
    return true
  } catch {
    return false
  }
}

/** Paints the resolved theme: the `dark` class on <html> and the browser chrome color. */
export function applyTheme(theme: ResolvedTheme, doc: Document): void {
  doc.documentElement.classList.toggle('dark', theme === 'dark')
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}
