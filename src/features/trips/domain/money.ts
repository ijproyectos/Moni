import { formatSaving } from '@/features/ahorros/domain/ahorros'
import type { Cents } from '@/shared/lib/money'
import type { TripCurrency } from './trip'

/** "$150.000" or "US$ 700": the symbol says the currency; what a trip holds in one currency is never silently converted. */
export function moneyIn(cents: Cents, currency: TripCurrency): string {
  return formatSaving(cents, currency)
}
