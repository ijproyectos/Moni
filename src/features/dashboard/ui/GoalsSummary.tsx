import { Link } from 'react-router'
import { percentLabel } from '@/features/goals/domain/goals'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import type { Cents } from '@/shared/lib/money'

export interface GoalsOverview {
  reservedCents: Cents
  targetCents: Cents
  count?: number
  /** What the active goals still ask for this month; null while the plan is not known. */
  missingCents?: Cents | null
  /** What the plan asks for this month (to tell "you are up to date" from "there is no plan"). */
  requiredCents?: Cents | null
}

/** Inicio's summary of Metas: the share saved, the bar and what is left this month. The detail lives in Metas. */
export function GoalsSummary({ goals }: { goals: GoalsOverview }) {
  const count = goals.count ?? 0
  const share = goals.targetCents > 0 ? Math.min(1, goals.reservedCents / goals.targetCents) : 0
  return (
    <section aria-labelledby="goals-title" className="border-t border-line px-5 py-6">
      <div className="flex items-baseline justify-between">
        <h2 id="goals-title" className="font-display text-[28px] font-extrabold">
          Metas
        </h2>
        {count > 0 && (
          <Link to="/metas" className="flex min-h-11 items-center text-[16px] text-text-muted">
            {count === 1 ? 'Ver la meta' : `Ver las ${count}`}
          </Link>
        )}
      </div>
      {count === 0 ? (
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="text-[17px] leading-6 text-text-muted">
            Todavía no tenés metas. Elegí qué querés juntar y Moni te dice cuánto ahorrar cada mes.
          </p>
          <Link
            to="/metas"
            className="flex min-h-11 shrink-0 items-center rounded-full bg-ink px-5 font-display text-[16px] font-extrabold text-cream dark:bg-lime dark:text-forest"
          >
            Crear
          </Link>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-5">
          <p className="font-display text-[72px] font-extrabold leading-none tracking-tight">
            {percentLabel(share)}
          </p>
          <div className="min-w-0 flex-1">
            <div
              role="progressbar"
              aria-label="Avance de tus metas"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(share * 100)}
              className="h-3.5 w-full overflow-hidden rounded-full bg-track"
            >
              <div
                className="h-full rounded-full bg-forest dark:bg-lime"
                style={{ width: `${Math.max(share * 100, share > 0 ? 3 : 0)}%` }}
              />
            </div>
            <p className="mt-3 text-[17px] leading-6 text-text-muted">
              <AmountDisplay cents={goals.reservedCents} /> de{' '}
              <AmountDisplay cents={goals.targetCents} />
            </p>
            {goals.missingCents != null && goals.missingCents > 0 ? (
              <p className="text-[17px] leading-6 text-text-muted">
                Este mes faltan{' '}
                <AmountDisplay cents={goals.missingCents} className="font-extrabold text-ink" />
              </p>
            ) : goals.missingCents === 0 && (goals.requiredCents ?? 0) > 0 ? (
              <p className="text-[17px] leading-6 text-text-muted">
                Este mes ya cumpliste tu plan.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
