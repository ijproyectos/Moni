import { useCallback } from 'react'
import { convertArsCents } from '@/shared/lib/exchangeRates'
import { formatCompact, formatMoney, type Cents } from '@/shared/lib/money'
import { useDisplayCurrency } from './displayCurrencyContext'

/**
 * Drop-in replacement for `formatArs` that respects "Moneda de visualización": same signature
 * (`cents`, optional `{ signed }`), converts first when the user picked a currency other than ARS,
 * and falls back to ARS untouched if there's no rate yet.
 */
export function useFormatMoney() {
  const { currency, rates } = useDisplayCurrency()
  return useCallback(
    (cents: Cents, options?: { signed?: boolean }) => {
      const converted = currency !== 'ARS' && rates ? convertArsCents(cents, currency, rates) : null
      return formatMoney(converted ?? cents, converted !== null ? currency : 'ARS', options)
    },
    [currency, rates],
  )
}

/** Same idea as `useFormatMoney` but for `formatCompact` ("1.2M"): converts first, then compacts in the target currency's units. */
export function useFormatCompactMoney() {
  const { currency, rates } = useDisplayCurrency()
  return useCallback(
    (cents: Cents) => {
      const converted = currency !== 'ARS' && rates ? convertArsCents(cents, currency, rates) : null
      return formatCompact(converted ?? cents)
    },
    [currency, rates],
  )
}
