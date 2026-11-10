import { Link } from 'react-router'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import type { Cents } from '@/shared/lib/money'

export interface SharedBalance {
  /** What the groups owe the person, in all. */
  owedCents: Cents
  /** What the person owes the groups, in all. */
  oweCents: Cents
}

interface SharedExpensesCardProps {
  shared: SharedBalance
  /** Where "Dividir gasto" leads (the groups). */
  to: string
}

/** Compact card of group expenses: what they owe the person (real balances only) and the way to split a new one. */
export function SharedExpensesCard({ shared, to }: SharedExpensesCardProps) {
  const { owedCents, oweCents } = shared
  const label = owedCents > 0 ? 'Gastos compartidos · te deben' : oweCents > 0 ? 'Gastos compartidos · debés' : 'Gastos compartidos'
  return (
    <section
      aria-label="Gastos compartidos"
      className="mx-[18px] flex items-center gap-3 rounded-[26px] bg-card py-2.5 pl-3.5 pr-2.5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-text-muted">{label}</p>
        {owedCents > 0 ? (
          <AmountDisplay
            cents={owedCents}
            signed
            className="block font-display text-[17px] font-semibold text-mint-ink"
          />
        ) : oweCents > 0 ? (
          <AmountDisplay
            cents={oweCents}
            className="block font-display text-[17px] font-semibold text-ink"
          />
        ) : (
          <p className="text-[14px] text-text-muted">Sin saldos pendientes en tus grupos.</p>
        )}
      </div>
      <Link
        to={to}
        className={cn(
          'flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-full bg-mint px-3.5 text-[13.5px] font-semibold text-white',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink',
        )}
      >
        Dividir gasto
      </Link>
    </section>
  )
}
