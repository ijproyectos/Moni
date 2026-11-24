import { useQuery } from '@tanstack/react-query'
import { fetchExchangeRates } from './exchangeRates'

/** Usa el mismo cache persistido por usuario que el resto de las queries (se limpia al cerrar sesión). */
export const EXCHANGE_RATES_KEY = ['fx', 'display-currency', 'ars-base'] as const
export const EXCHANGE_RATES_STALE_MS = 12 * 60 * 60 * 1000

/**
 * Tasas de cambio con base ARS. `enabled` en false evita el fetch cuando la moneda de visualización
 * es ARS (el caso más común no necesita red). Un refetch fallido deja la última tasa cacheada en
 * `data` (con `isError`), para poder avisar que puede estar desactualizada en vez de romper la UI.
 */
export function useExchangeRates(enabled: boolean) {
  return useQuery({
    queryKey: EXCHANGE_RATES_KEY,
    queryFn: () => fetchExchangeRates(),
    enabled,
    staleTime: EXCHANGE_RATES_STALE_MS,
    retry: false,
  })
}
