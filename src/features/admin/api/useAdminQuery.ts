import { useQuery } from '@tanstack/react-query'
import { AdminApiError } from './adminRepository'

/** Admin reads always start with 'admin' in the key: that prefix is never saved to the persisted cache. */
export function useAdminQuery<T>(key: readonly unknown[], fetcher: () => Promise<T>) {
  return useQuery({
    queryKey: ['admin', ...key],
    queryFn: fetcher,
    staleTime: 60_000,
    networkMode: 'online',
    // A refusal (4xx) will not change by retrying; a server error gets one more try.
    retry: (count, error) => !(error instanceof AdminApiError && error.status < 500) && count < 1,
  })
}
