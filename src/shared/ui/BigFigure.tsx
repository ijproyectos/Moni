import { convertArsCents } from '@/shared/lib/exchangeRates'
import { formatMoney, type Cents } from '@/shared/lib/money'
import { AmountDisplay } from './AmountDisplay'
import { cn } from './cn'
import { useDisplayCurrency } from './displayCurrencyContext'
import { useHiddenAmounts } from './hiddenAmountsContext'

interface BigFigureProps {
  cents: Cents
  /** Prefix "+" for positive amounts. */
  signed?: boolean
  className?: string
}

/**
 * Big hero amount: pesos (o la moneda de visualización elegida) a tamaño completo, los decimales
 * (solo cuando hay) a ~55%. Enmascarado cuando los montos están ocultos.
 */
export function BigFigure({ cents, signed, className }: BigFigureProps) {
  const { hidden } = useHiddenAmounts()
  const { currency, rates } = useDisplayCurrency()
  const converted = currency !== 'ARS' && rates ? convertArsCents(cents, currency, rates) : null
  const displayCents = converted ?? cents
  const displayCurrency = converted !== null ? currency : 'ARS'
  const [whole = '', decimals] = formatMoney(displayCents, displayCurrency, { signed }).split(',')
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
