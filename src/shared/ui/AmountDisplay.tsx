import { convertArsCents } from '@/shared/lib/exchangeRates'
import { formatCompact, formatMoney, formatMoneyDigits, type Cents } from '@/shared/lib/money'
import { cn } from './cn'
import { useDisplayCurrency } from './displayCurrencyContext'
import { useHiddenAmounts } from './hiddenAmountsContext'

export const MASK = '••••'

interface AmountDisplayProps {
  cents: Cents
  /** Prefix "+" for positive amounts ("-" is always shown for negatives). */
  signed?: boolean
  /** Number only, without sign or "$" (the caller renders them). */
  bare?: boolean
  compact?: boolean
  className?: string
}

/**
 * Renders money, or a mask when the user chose to hide amounts. `cents` is always ARS (how everything
 * is stored); when the user picked another "moneda de visualización" this converts just for display,
 * falling back to ARS untouched if there's no rate yet (first load, offline, fetch failed).
 */
export function AmountDisplay({ cents, signed, bare, compact, className }: AmountDisplayProps) {
  const { hidden } = useHiddenAmounts()
  const { currency, rates } = useDisplayCurrency()

  if (hidden) {
    return (
      <span className={className} aria-label="Monto oculto">
        {MASK}
      </span>
    )
  }

  const converted = currency !== 'ARS' && rates ? convertArsCents(cents, currency, rates) : null
  const displayCents = converted ?? cents
  const displayCurrency = converted !== null ? currency : 'ARS'

  const text = compact
    ? formatCompact(displayCents)
    : bare
      ? formatMoneyDigits(displayCents)
      : formatMoney(displayCents, displayCurrency, { signed })
  return <span className={cn('tabular-nums', className)}>{text}</span>
}
