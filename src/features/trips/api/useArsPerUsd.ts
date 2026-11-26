import { useExchangeRates } from '@/shared/lib/useExchangeRates'

/** Pesos per dollar from the same rates Moni already uses to display other currencies; null while unknown (nothing is invented). */
export function useArsPerUsd(enabled = true): number | null {
  const rates = useExchangeRates(enabled)
  const perArs = rates.data?.rates.USD
  return typeof perArs === 'number' && perArs > 0 ? Math.round((1 / perArs) * 100) / 100 : null
}
