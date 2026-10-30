import { useSyncExternalStore } from 'react'
import type { ResolvedTheme, ThemeMode } from '../domain/theme'
import { themeStore } from './themeStore'

/** Current appearance mode (what the person picked) and the theme actually shown. */
export function useTheme(): {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
} {
  const mode = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getMode,
    () => 'system' as const,
  )
  const resolved = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getResolved,
    () => 'light' as const,
  )
  return { mode, resolved, setMode: themeStore.setMode }
}
