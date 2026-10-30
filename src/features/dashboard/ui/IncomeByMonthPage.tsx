import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatMonthName } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { Page, Panel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { usePeriodSummary } from '../api/useMonthSummary'
import { annualIncomeCents, monthlyIncomeForYear } from '../domain/monthlyIncome'

const MIN_YEAR = 2000

const stepClass =
  'flex size-11 items-center justify-center rounded-full border border-sand bg-white text-forest disabled:opacity-40'

// Ingresos por mes — income received each month of a year, with the annual total (real data:
// one get_period_summary call for the whole year).
export function IncomeByMonthPage() {
  const currentYear = Number(todayIso().slice(0, 4))
  const [year, setYear] = useState(currentYear)
  const summary = usePeriodSummary(`${year}-01-01`, `${year + 1}-01-01`)
  const months = useMemo(
    () => monthlyIncomeForYear(year, summary.data?.daily ?? []),
    [year, summary.data],
  )
  const total = annualIncomeCents(months)

  return (
    <Page>
      <PageHeader title="Ingresos por mes" backTo="/tu-anio" />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Año anterior"
          disabled={year <= MIN_YEAR}
          onClick={() => setYear((y) => y - 1)}
          className={stepClass}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>
        <h2 className="font-display text-[24px] font-extrabold" aria-live="polite">
          {year}
        </h2>
        <button
          type="button"
          aria-label="Año siguiente"
          disabled={year >= currentYear}
          onClick={() => setYear((y) => y + 1)}
          className={stepClass}
        >
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
      </div>

      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Ingresos de {year}
        </p>
        {summary.isLoading ? (
          <Skeleton className="mt-2 h-12" />
        ) : (
          <p className="font-display text-[40px] font-extrabold" aria-label="Total anual">
            {summary.isError ? '—' : formatArs(total)}
          </p>
        )}
        <p className="text-[16px] text-text-muted-on-dark">
          Lo que te entró en el año, mes por mes.
        </p>
      </section>

      {summary.isError ? (
        <p role="alert" className="text-center text-[16px] text-expense">
          No pudimos cargar tus ingresos.{' '}
          <button
            type="button"
            onClick={() => void summary.refetch()}
            className="font-extrabold underline"
          >
            Reintentar
          </button>
        </p>
      ) : summary.isLoading ? (
        <Panel aria-busy="true">
          <Skeleton className="h-64" />
        </Panel>
      ) : (
        <Panel className="py-1">
          <ul aria-label={`Ingresos por mes de ${year}`} className="divide-y divide-sand">
            {months.map((m) => {
              const empty = m.incomeCents === 0
              return (
                <li
                  key={m.month}
                  className={cn(
                    'flex items-center justify-between gap-3 py-3',
                    empty && 'text-text-muted',
                  )}
                >
                  <span className="text-[18px] font-extrabold">{formatMonthName(m.month)}</span>
                  <span
                    className={cn(
                      'text-[18px]',
                      empty ? 'font-medium' : 'font-extrabold text-income',
                    )}
                  >
                    {formatArs(m.incomeCents)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </Page>
  )
}
