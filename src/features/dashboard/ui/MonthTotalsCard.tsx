import { Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router'
import { pairAmountSize } from '@/shared/lib/amountSize'
import { formatArs, type Cents } from '@/shared/lib/money'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'

interface MonthTotalsCardProps {
  /** Money on hand right now: cash, banks and wallets (no cards, archived accounts or savings goals). */
  availableCents: Cents
  incomeCents: Cents
  expenseCents: Cents
}

/** Size of the balance: it shrinks with the number of digits so a long amount never leaves the screen. */
function balanceSize(digits: number): string {
  if (digits <= 7) return 'text-[30px]'
  if (digits <= 9) return 'text-[27px]'
  if (digits <= 11) return 'text-[24px]'
  return 'text-[21px]'
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

/** Compact card under the hero: the money on hand and the month's expenses and income (what the old header showed). */
export function MonthTotalsCard({
  availableCents,
  incomeCents,
  expenseCents,
}: MonthTotalsCardProps) {
  const { hidden, toggle } = useHiddenAmounts()
  // Hidden amounts must not give away that the balance is in the red.
  const negative = availableCents < 0 && !hidden
  const bigSize = balanceSize(hidden ? 4 : formatArs(Math.abs(availableCents)).length - 1)
  const chipText = pairAmountSize(
    hidden
      ? 0
      : Math.max(formatArs(-expenseCents).length, formatArs(incomeCents, { signed: true }).length),
    'home',
  )
  return (
    <section
      aria-label="Resumen de tu dinero"
      className="mx-[18px] rounded-[26px] bg-card px-4 py-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/cuentas"
          aria-label="Ver tus medios de pago"
          className={cn('min-w-0 flex-1 rounded-[20px]', RING)}
        >
          <p className="text-[13px] font-semibold text-text-muted">Dinero disponible</p>
          <p
            className={cn(
              'flex items-baseline gap-0.5 font-display font-bold',
              negative && 'text-expense',
            )}
          >
            {/* `bare` drops the sign: money owed (accounts in the red) must not read as money on hand. */}
            {negative && <span className={cn(bigSize, 'leading-none')}>-</span>}
            <span
              className={cn(
                'self-start pt-0.5 text-[18px]',
                negative ? 'text-expense' : 'text-income',
              )}
            >
              $
            </span>
            <AmountDisplay
              cents={availableCents}
              bare
              className={cn(
                'min-w-0 leading-none tracking-tight',
                bigSize,
                negative ? 'text-expense' : 'text-ink',
              )}
            />
          </p>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted',
            RING,
          )}
        >
          {hidden ? (
            <EyeOff aria-hidden="true" className="size-5" strokeWidth={2} />
          ) : (
            <Eye aria-hidden="true" className="size-5" strokeWidth={2} />
          )}
        </button>
      </div>

      <div
        className="mt-2 flex border-t border-line pt-2.5"
        role="group"
        aria-label="Gastos e ingresos del mes"
      >
        <Link
          to="/este-mes"
          aria-label="Gastos del mes, ver el informe"
          className={cn('flex min-w-fit basis-auto flex-col gap-0.5 rounded-lg pr-4', RING)}
          style={{ flexGrow: 1 }}
        >
          <span className="text-[13px] text-text-muted">Gastos</span>
          <span
            data-amount
            className={cn('whitespace-nowrap font-display font-bold text-expense', chipText)}
          >
            <AmountDisplay cents={-expenseCents} />
          </span>
        </Link>
        <Link
          to="/este-mes"
          aria-label="Ingresos del mes, ver el informe"
          className={cn(
            'flex min-w-fit basis-auto flex-col gap-0.5 rounded-lg border-l border-line pl-4',
            RING,
          )}
          style={{ flexGrow: 1 }}
        >
          <span className="text-[13px] text-text-muted">Ingresos</span>
          <span
            data-amount
            className={cn('whitespace-nowrap font-display font-bold text-income', chipText)}
          >
            <AmountDisplay cents={incomeCents} signed />
          </span>
        </Link>
      </div>
    </section>
  )
}
