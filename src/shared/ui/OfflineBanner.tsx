import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Slim notice while offline; on reconnect it refetches what is on screen and disappears. */
export function OfflineBanner() {
  const online = useOnlineStatus()
  const queryClient = useQueryClient()
  const cache = queryClient.getQueryCache()
  const wasOffline = useRef(false)

  // Most recent successful fetch in the cache (restored or live): when the saved data was last updated.
  const lastUpdated = useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => cache.getAll().reduce((latest, q) => Math.max(latest, q.state.dataUpdatedAt), 0),
    () => 0,
  )

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      return
    }
    if (wasOffline.current) {
      wasOffline.current = false
      void queryClient.refetchQueries({ type: 'active' })
    }
  }, [online, queryClient])

  if (online) return null
  return (
    <div
      role="status"
      className="sticky top-0 z-40 mx-auto w-full max-w-[430px] bg-sand px-4 py-2 text-center text-[14px] font-semibold text-ink"
    >
      Sin conexión · Estás viendo datos guardados
      {lastUpdated > 0 && (
        <span className="text-text-muted"> · Última vez {formatTime(lastUpdated)}</span>
      )}
    </div>
  )
}
