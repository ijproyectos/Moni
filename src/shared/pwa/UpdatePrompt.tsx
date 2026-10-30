import { useEffect, useRef, useState } from 'react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Registers the service worker (production only) and offers "Actualizar" when a new version is
 * waiting. Nothing happens in dev, in tests or in browsers without service workers.
 */
export function UpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const applyUpdate = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let interval: number | undefined
    let cancelled = false
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return
        applyUpdate.current = registerSW({
          onNeedRefresh: () => setNeedsRefresh(true),
          onRegisteredSW: (_url, registration) => {
            if (registration) {
              interval = window.setInterval(() => void registration.update(), UPDATE_CHECK_MS)
            }
          },
          onRegisterError: () => undefined,
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (interval) window.clearInterval(interval)
    }
  }, [])

  if (!needsRefresh) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] mx-auto flex w-full max-w-[430px] justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-forest py-2 pl-4 pr-2 font-display text-base font-semibold text-cream shadow-lg"
      >
        <span>Hay una versión nueva</span>
        <button
          type="button"
          onClick={() => void applyUpdate.current?.()}
          className="min-h-9 rounded-full bg-lime px-4 font-extrabold text-forest"
        >
          Actualizar
        </button>
      </div>
    </div>
  )
}
