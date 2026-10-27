import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { HiddenAmountsContext } from './hiddenAmountsContext'

export const HIDDEN_AMOUNTS_STORAGE_KEY = 'moni.hiddenAmounts'

function readStored(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_AMOUNTS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Keeps the "hide amounts" preference; persisted per browser, never required to work. */
export function HiddenAmountsProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readStored)

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current
      try {
        window.localStorage.setItem(HIDDEN_AMOUNTS_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Storage can be blocked; the preference then lasts for the session only.
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <HiddenAmountsContext.Provider value={value}>{children}</HiddenAmountsContext.Provider>
}
