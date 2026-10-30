import { MutationCache, QueryClient } from '@tanstack/react-query'
import { assertOnline } from './offline'

/** How long cached reads survive in memory and in the persisted copy. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    // Runs before every mutationFn: offline writes fail fast with OfflineError, no request is made.
    mutationCache: new MutationCache({ onMutate: () => assertOnline() }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        gcTime: CACHE_MAX_AGE_MS,
        // Serve the cache first; the fetch may fail offline without clearing what is shown.
        networkMode: 'offlineFirst',
      },
      // 'always' stops TanStack from pausing and replaying a mutation later (no offline queue).
      mutations: { networkMode: 'always', retry: 0 },
    },
  })
}
