import { useEffect, useRef } from 'react'
import {
  INACTIVITY_CHECK_MS,
  INACTIVITY_LIMIT_MS,
  clearLastActivity,
  isExpired,
  readLastActivity,
  writeLastActivity,
} from '../domain/inactivity'

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
const WRITE_THROTTLE_MS = 5_000

/**
 * Calls `onTimeout` once after 30 minutes without activity (pointer, keyboard, tab becoming visible). The last
 * activity is also stored, so closing the tab and coming back after the limit signs out too.
 */
export function useInactivityLogout(enabled: boolean, onTimeout: () => void): void {
  const callback = useRef(onTimeout)
  useEffect(() => {
    callback.current = onTimeout
  }, [onTimeout])

  useEffect(() => {
    if (!enabled) return
    let fired = false
    let lastWrite = 0
    // In-memory copy: still enforces the limit while the tab is open when storage is blocked.
    let memory: number | null = null

    const expire = () => {
      if (fired) return
      fired = true
      clearLastActivity()
      callback.current()
    }
    const touch = () => {
      const now = Date.now()
      memory = now
      if (now - lastWrite < WRITE_THROTTLE_MS) return
      lastWrite = now
      writeLastActivity(now)
    }
    const check = () => {
      // The most recent of this tab and any other admin tab (they share the stored value).
      const known = [readLastActivity(), memory].filter((v): v is number => v !== null)
      const last = known.length > 0 ? Math.max(...known) : null
      if (isExpired(last, Date.now(), INACTIVITY_LIMIT_MS)) expire()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      check()
      if (!fired) touch()
    }

    // Entering with an old record means the previous session already idled out.
    check()
    if (!fired) {
      lastWrite = 0
      touch()
    }

    const onActivity = () => {
      if (!fired) touch()
    }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(check, INACTIVITY_CHECK_MS)
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [enabled])
}
