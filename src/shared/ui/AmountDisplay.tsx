import { formatArs, formatCompact, type Cents } from '@/shared/lib/money'
import { cn } from './cn'
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

/** Renders money, or a mask when the user chose to hide amounts. */
export function AmountDisplay({ cents, signed, bare, compact, className }: AmountDisplayProps) {
  const { hidden } = useHiddenAmounts()

  if (hidden) {
    return (
      <span className={className} aria-label="Monto oculto">
        {MASK}
      </span>
    )
  }

  const text = compact
    ? formatCompact(cents)
    : bare
      ? formatArs(Math.abs(cents)).slice(1)
      : formatArs(cents, { signed })
  return <span className={cn('tabular-nums', className)}>{text}</span>
}
