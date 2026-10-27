import { Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { MonthPicker } from '@/shared/ui/MonthPicker'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

interface HomeHeaderProps {
  month: IsoDate
  latestMonth: IsoDate
  onMonthChange: (month: IsoDate) => void
  initial: string
  balanceCents: Cents
  incomeCents: Cents
  expenseCents: Cents
  availableCents: Cents
}

export function HomeHeader({
  month,
  latestMonth,
  onMonthChange,
  initial,
  balanceCents,
  incomeCents,
  expenseCents,
  availableCents,
}: HomeHeaderProps) {
  const { hidden, toggle } = useHiddenAmounts()
  const total = incomeCents + expenseCents
  const expenseShare = total > 0 ? Math.max(expenseCents / total, 0.28) : 0.5
  const incomeShare = total > 0 ? Math.max(incomeCents / total, 0.28) : 0.5

  return (
    <header className="rounded-b-[40px] bg-forest px-5 pb-5 pt-6 text-cream">
      <div className="flex items-center justify-between gap-3">
        <MonthPicker value={month} latest={latestMonth} onChange={onMonthChange} />
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-lime/90"
          >
            <img src={mascotUrl} alt="" className="size-10" />
          </span>
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="flex size-12 items-center justify-center rounded-full bg-lime font-display text-xl font-semibold text-forest"
          >
            {initial}
          </Link>
        </div>
      </div>

      <p className="mt-2 text-[17px] text-text-muted-on-dark">Balance del mes</p>
      <div className="mt-1 flex items-center gap-3">
        <p className="flex items-baseline gap-1 font-display font-bold">
          <span className="text-[32px] text-lime">{balanceCents < 0 ? '-' : '+'}$</span>
          <AmountDisplay
            cents={balanceCents}
            bare
            className="text-[56px] leading-[64px] text-cream"
          />
        </p>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
          className="flex size-11 items-center justify-center rounded-full text-text-muted-on-dark"
        >
          {hidden ? (
            <EyeOff aria-hidden="true" className="size-6" strokeWidth={2} />
          ) : (
            <Eye aria-hidden="true" className="size-6" strokeWidth={2} />
          )}
        </button>
      </div>

      <div
        className="mt-3 flex gap-1 rounded-full bg-black/20 p-1"
        role="group"
        aria-label="Gastos e ingresos del mes"
      >
        <span
          className={cn(
            'flex h-12 items-center justify-center rounded-full bg-blush px-3 font-display text-base font-semibold text-forest',
          )}
          style={{ flexGrow: expenseShare }}
        >
          <AmountDisplay cents={-expenseCents} />
        </span>
        <span
          className="flex h-12 items-center justify-center rounded-full bg-lime px-3 font-display text-base font-semibold text-forest"
          style={{ flexGrow: incomeShare }}
        >
          <AmountDisplay cents={incomeCents} signed />
        </span>
      </div>

      <p className="mt-3 text-[15px] text-text-muted-on-dark">
        Disponible en cuentas:{' '}
        <AmountDisplay cents={availableCents} className="font-display font-semibold text-cream" />
      </p>
    </header>
  )
}
