import { formatArs, type Cents } from '@/shared/lib/money'
import { AmountDisplay } from './AmountDisplay'
import { cn } from './cn'
import { useHiddenAmounts } from './hiddenAmountsContext'

interface BigFigureProps {
  cents: Cents
  /** Prefix "+" for positive amounts. */
  signed?: boolean
  className?: string
}

/** Big hero amount: pesos at full size, the decimals (only when there are cents) at ~55%. Masked when amounts are hidden. */
export function BigFigure({ cents, signed, className }: BigFigureProps) {
  const { hidden } = useHiddenAmounts()
  const [whole = '', decimals] = formatArs(cents, { signed }).split(',')
  return (
    <p
      className={cn(
        'whitespace-nowrap font-display text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums',
        className,
      )}
    >
      {hidden ? (
        <AmountDisplay cents={cents} />
      ) : (
        <>
          {whole}
          {decimals && <span className="text-[0.55em] font-medium">,{decimals}</span>}
        </>
      )}
    </p>
  )
}
