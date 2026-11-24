import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CURRENCY_CODE, getCurrency } from '@/shared/lib/currencies'
import { useExchangeRates } from '@/shared/lib/useExchangeRates'
import { DisplayCurrencyContext } from './displayCurrencyContext'

export const DISPLAY_CURRENCY_STORAGE_KEY = 'moni.displayCurrency'

function readStored(): string {
  try {
    const stored = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)
    return stored && getCurrency(stored) ? stored : DEFAULT_CURRENCY_CODE
  } catch {
    return DEFAULT_CURRENCY_CODE
  }
}

/**
 * Mantiene la preferencia de "Moneda de visualización"; persistida por dispositivo, nunca requerida
 * para que la app funcione (si falla el storage o el fetch de tasas, todo sigue mostrándose en ARS).
 */
export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState(readStored)
  const needsRates = currency !== DEFAULT_CURRENCY_CODE
  const ratesQuery = useExchangeRates(needsRates)

  const setCurrency = useCallback((code: string) => {
    if (!getCurrency(code)) return
    setCurrencyState(code)
    try {
      window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, code)
    } catch {
      // El storage puede estar bloqueado; la preferencia dura solo la sesión.
    }
  }, [])

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      rates: ratesQuery.data?.rates,
      ratesUpdatedAt: ratesQuery.data?.updatedAt ?? null,
      ratesStale: needsRates && ratesQuery.isError && Boolean(ratesQuery.data),
    }),
    [currency, setCurrency, ratesQuery.data, ratesQuery.isError, needsRates],
  )

  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>
}
