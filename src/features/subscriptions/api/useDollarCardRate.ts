import { useQuery } from '@tanstack/react-query'
import { fetchDollarCardRate } from './dollarCardRate'

/** Not user-specific. It rides the per-user persisted cache (so it is wiped with it on sign-out). */
export const DOLLAR_CARD_KEY = ['fx', 'usd-ars', 'tarjeta'] as const
export const RATE_STALE_MS = 30 * 60 * 1000

/**
 * Current dólar tarjeta rate. A failed refetch keeps the last cached rate in `data` (with `isError`),
 * so the UI can still show it labelled with its date; with nothing cached `data` is undefined.
 */
export function useDollarCardRate(enabled = true) {
  return useQuery({
    queryKey: DOLLAR_CARD_KEY,
    queryFn: () => fetchDollarCardRate(),
    enabled,
    staleTime: RATE_STALE_MS,
    retry: false,
  })
}
