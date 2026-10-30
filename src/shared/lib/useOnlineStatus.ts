import { onlineManager } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  return onlineManager.subscribe(onChange)
}

/** True while the browser has a connection. Backed by TanStack's onlineManager. */
export function useOnlineStatus(): boolean {
  const online = useSyncExternalStore(
    subscribe,
    () => onlineManager.isOnline(),
    () => true,
  )

  // The manager listens to these too; syncing here keeps the hook right even if its listener was replaced.
  useEffect(() => {
    const goOnline = () => onlineManager.setOnline(true)
    const goOffline = () => onlineManager.setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
