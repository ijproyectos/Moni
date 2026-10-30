import type { QueryClient } from '@tanstack/react-query'
import { useIsRestoring } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import { createUserPersister } from '@/shared/lib/persistedCache'
import { CACHE_MAX_AGE_MS } from '@/shared/lib/queryClient'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'

const DEHYDRATE_OPTIONS = {
  // Only successful reads are saved; mutations (writes) never are.
  shouldDehydrateQuery: (query: { state: { status: string } }) => query.state.status === 'success',
  shouldDehydrateMutation: () => false,
}

/** Holds the render until the persisted cache is back, so screens never flash an empty state. */
function RestoreGate({ children }: { children: ReactNode }) {
  return useIsRestoring() ? <FullScreenLoader /> : children
}

function UserCache({
  userId,
  client,
  children,
}: {
  userId: string | null
  client: QueryClient
  children: ReactNode
}) {
  const [persister] = useState(() => createUserPersister(userId))
  const [persistOptions] = useState(() => ({
    persister,
    maxAge: CACHE_MAX_AGE_MS,
    buster: __APP_VERSION__,
    dehydrateOptions: DEHYDRATE_OPTIONS,
  }))
  useEffect(() => {
    persister.activate()
    return () => persister.dispose()
  }, [persister])

  return (
    <PersistQueryClientProvider client={client} persistOptions={persistOptions}>
      <RestoreGate>{children}</RestoreGate>
    </PersistQueryClientProvider>
  )
}

/**
 * Persists the read cache per signed-in user. The provider is re-created (keyed) whenever the user
 * id changes, so a restore only ever happens for the current user and nothing is saved while
 * signed out. Wiping on sign-out / user change lives in UserDataGuard (clearUserData).
 */
export function PersistedQueryProvider({
  client,
  children,
}: {
  client: QueryClient
  children: ReactNode
}) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  return (
    <UserCache key={userId ?? 'anonymous'} userId={userId} client={client}>
      {children}
    </UserCache>
  )
}
