import { createContext, useContext } from 'react'
import { DEFAULT_CURRENCY_CODE } from '@/shared/lib/currencies'

export interface DisplayCurrencyState {
  /** Código ISO de la moneda elegida en Configuración (default ARS, que es como se guarda todo). */
  currency: string
  setCurrency: (code: string) => void
  /** Unidades de cada moneda por 1 ARS. undefined mientras carga o si currency es ARS (no hace falta). */
  rates: Record<string, number> | undefined
  /** Cuándo se actualizaron esas tasas en el servidor, o null si todavía no hay ninguna. */
  ratesUpdatedAt: string | null
  /** true cuando lo que se ve es la última tasa cacheada porque el último fetch falló. */
  ratesStale: boolean
}

export const DisplayCurrencyContext = createContext<DisplayCurrencyState>({
  currency: DEFAULT_CURRENCY_CODE,
  setCurrency: () => undefined,
  rates: undefined,
  ratesUpdatedAt: null,
  ratesStale: false,
})

export function useDisplayCurrency(): DisplayCurrencyState {
  return useContext(DisplayCurrencyContext)
}
