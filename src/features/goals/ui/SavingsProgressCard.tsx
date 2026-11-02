import { CalendarRange, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { formatArs } from '@/shared/lib/money'
import { monthStart, shiftMonth, type IsoDate } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { MoniSays } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useSavingsPlanData } from '../api/useSavings'
import type { SavingsOverview } from '../domain/savings'
import {
  monthPoint,
  monthVerdict,
  planNow,
  recommend,
  scaleMax,
  STATUS_LABELS,
  type MonthPoint,
  type PlanInput,
  type ProgressStatus,
} from '../domain/savingsPlan'
import { monthShort, monthTitle, WINDOW_MONTHS } from './chartMonths'
import { SavingsChart } from './SavingsChart'

/** Months behind today that the window opens on: two before, the current month and three ahead. */
const MONTHS_BEFORE_TODAY = 2

const STATUS_TONE: Record<ProgressStatus, string> = {
  empty: 'bg-sand',
  done: 'bg-lime text-forest',
  attention: 'bg-blush text-forest',
  behind: 'bg-gold/60 text-forest',
  on_track: 'bg-lime text-forest',
  pending: 'bg-sand',
  no_plan: 'bg-sand',
}

const rangeLabel = (from: IsoDate, to: IsoDate) =>
  from === to
    ? `${monthShort(from)} ${from.slice(0, 4)}`
    : `${monthShort(from)}${from.slice(0, 4) === to.slice(0, 4) ? '' : ` ${from.slice(0, 4)}`} – ${monthShort(to)} ${to.slice(0, 4)}`

/** "Tu progreso en metas": what the goals ask for each month, what was really saved, and how the person is doing. */
export function SavingsProgressCard({ overview }: { overview: SavingsOverview }) {
  const planData = useSavingsPlanData()
  const current = monthStart(overview.today)
  const [start, setStart] = useState<IsoDate>(() => shiftMonth(current, -MONTHS_BEFORE_TODAY))
  const [selected, setSelected] = useState<IsoDate>(current)
  const [stepsOpen, setStepsOpen] = useState(false)

  const input = useMemo<PlanInput | null>(
    () =>
      planData.data ? { today: overview.today, goals: overview.goals, data: planData.data } : null,
    [planData.data, overview.today, overview.goals],
  )
  const now = useMemo(() => (input ? planNow(input) : null), [input])

  // One scale for the whole span the data (and the plan) covers, so bars stay comparable while the window moves.
  const max = useMemo(() => {
    if (!input) return 0
    const dates = [
      ...input.data.months.map((m) => m.month),
      ...input.goals.flatMap((g) => (g.targetDate ? [monthStart(g.targetDate)] : [])),
      current,
      start,
      shiftMonth(start, WINDOW_MONTHS - 1),
    ].sort()
    return scaleMax(input, dates[0] ?? current, dates[dates.length - 1] ?? current)
  }, [input, current, start])

  if (planData.isLoading || !overview) {
    return <Skeleton className="h-96" />
  }
  if (planData.isError || !input || !now) {
    return (
      <section className="rounded-[28px] border border-sand bg-card p-5">
        <h2 className="text-[22px] font-extrabold">Tu progreso en metas</h2>
        <p className="mt-2 text-[15px] leading-5 text-text-muted">
          No pudimos cargar el historial de tus metas. Probá de nuevo en un rato.
        </p>
      </section>
    )
  }

  const points: MonthPoint[] = Array.from({ length: WINDOW_MONTHS }, (_, i) =>
    monthPoint(input, shiftMonth(start, i)),
  )
  const detail = monthPoint(input, selected)
  const verdict = monthVerdict(detail)
  const rec = recommend(now)
  const open = now.goals.filter((p) => p.state !== 'done')
  const planned = open.filter((p) => p.state === 'planned' || p.state === 'attention')
  const hasChartData = overview.goals.length > 0

  return (
    <section
      aria-label="Tu progreso en metas"
      className="flex flex-col gap-4 rounded-[28px] border border-sand bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h2 className="text-[22px] font-extrabold leading-7">Tu progreso en metas</h2>
        {now.status !== 'empty' && (
          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-right text-[13px] font-extrabold leading-4',
              STATUS_TONE[now.status],
            )}
          >
            {STATUS_LABELS[now.status]}
          </span>
        )}
      </div>

      <div>
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
          Para alcanzar tus metas
        </p>
        {planned.length > 0 ? (
          <>
            <p className="font-display text-[34px] font-extrabold leading-[42px]">
              {formatArs(now.requiredCents)}{' '}
              <span className="text-[17px] font-extrabold text-text-muted">por mes</span>
            </p>
            <p className="text-[15px] text-text-muted">
              Según tus fechas objetivo.{' '}
              {now.missingCents === 0
                ? 'Este mes ya cumpliste.'
                : `Este mes ya reservaste ${formatArs(now.savedCents)} y te faltan ${formatArs(now.missingCents)}.`}
            </p>
            {now.steps.length > 1 && (
              <>
                <button
                  type="button"
                  aria-expanded={stepsOpen}
                  onClick={() => setStepsOpen((v) => !v)}
                  className="mt-1 flex min-h-9 items-center gap-1 text-[14px] font-extrabold underline"
                >
                  <CalendarRange aria-hidden="true" className="size-4" /> Ver el plan mes a mes
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('size-4 transition-transform', stepsOpen && 'rotate-180')}
                  />
                </button>
                {stepsOpen && (
                  <ul aria-label="Plan mes a mes" className="mt-1 flex flex-col gap-1 text-[15px]">
                    {now.steps.map((step) => (
                      <li key={step.from} className="flex justify-between gap-3">
                        <span className="capitalize text-text-muted">
                          {rangeLabel(step.from, step.to)}
                        </span>
                        <strong className="font-extrabold">
                          {formatArs(step.perMonthCents)} por mes
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        ) : (
          <p className="mt-1 text-[16px] leading-6">{emptyPlanText(now.status, open)}</p>
        )}
        {open.filter((p) => p.state === 'overdue' || p.state === 'no_date').length > 0 &&
          planned.length > 0 && (
            <p className="mt-1 text-[14px] leading-5 text-text-muted">
              {open
                .filter((p) => p.state === 'overdue' || p.state === 'no_date')
                .map((p) =>
                  p.state === 'overdue'
                    ? `${p.goal.name} ya venció`
                    : `${p.goal.name} no tiene fecha`,
                )
                .join(' · ')}
              : no entran en este cálculo.
            </p>
          )}
      </div>

      {hasChartData && (
        <SavingsChart
          points={points}
          max={max}
          selected={selected}
          currentMonth={current}
          onSelect={setSelected}
          onShift={(months) => setStart((s) => shiftMonth(s, months))}
          onToday={() => {
            setStart(shiftMonth(current, -MONTHS_BEFORE_TODAY))
            setSelected(current)
          }}
        />
      )}

      {hasChartData && (
        <div role="status" aria-live="polite" className="rounded-[18px] bg-sand/60 px-4 py-3">
          <p className="text-[17px] font-extrabold">
            {monthTitle(detail.month)}
            {detail.kind === 'current' && (
              <span className="font-bold text-text-muted"> · este mes</span>
            )}
            {detail.kind === 'future' && (
              <span className="font-bold text-text-muted"> · proyección</span>
            )}
          </p>
          <MonthDetailLines point={detail} verdict={verdict} />
        </div>
      )}

      <MoniSays lead="Moni dice:">{rec.text}</MoniSays>

      {open.length > 0 && (
        <Link
          to={rec.goalId ? `/metas/${rec.goalId}` : '#metas-individuales'}
          className="flex min-h-12 items-center justify-center rounded-full border-2 border-line bg-card text-[16px] font-extrabold"
        >
          Ver mi plan de ahorro
        </Link>
      )}
    </section>
  )
}

function emptyPlanText(
  status: ProgressStatus,
  open: { state: string; goal: { name: string } }[],
): string {
  if (status === 'empty') return 'Creá una meta con fecha y acá vas a ver cuánto reservar por mes.'
  if (status === 'done') return '¡Cumpliste todas tus metas activas!'
  if (open.some((p) => p.state === 'overdue'))
    return 'Tus metas ya vencieron: cambiá la fecha de cada una para que Moni recalcule cuánto reservar por mes.'
  if (open.some((p) => p.state === 'no_date'))
    return 'Ponele una fecha objetivo a tus metas y Moni te dice cuánto reservar por mes.'
  return 'No hay metas activas que pidan un ahorro mensual ahora.'
}

function MonthDetailLines({
  point,
  verdict,
}: {
  point: MonthPoint
  verdict: ReturnType<typeof monthVerdict>
}) {
  const row = (label: string, value: string, strong = false) => (
    <p className="flex justify-between gap-3 text-[16px]">
      <span className="text-text-muted">{label}</span>
      <span className={strong ? 'font-extrabold' : 'font-bold'}>{value}</span>
    </p>
  )
  switch (verdict.kind) {
    case 'future':
      return (
        <>
          {verdict.requiredCents > 0
            ? row('Necesario', formatArs(verdict.requiredCents))
            : row('Necesario', 'Sin metas con fecha para ese mes')}
          <p className="mt-1 text-[14px] leading-5 text-text-muted">
            Es una proyección con tus metas de hoy: todavía no hay aportes.
          </p>
        </>
      )
    case 'no_goals':
      return (
        <p className="text-[15px] leading-5 text-text-muted">
          Todavía no tenías metas este mes: no hay registros para mostrar.
        </p>
      )
    case 'no_plan':
      return (
        <>
          {row('Ahorrado', formatArs(verdict.savedCents))}
          <p className="mt-1 text-[14px] leading-5 text-text-muted">
            Ninguna meta con fecha pedía un aporte este mes.
            {point.hasRecords ? '' : ' Tampoco hay aportes registrados.'}
          </p>
        </>
      )
    case 'met':
      return (
        <>
          {row('Ahorrado', formatArs(verdict.savedCents))}
          {row('Necesario', formatArs(verdict.requiredCents))}
          <p className="mt-1 text-[15px] font-extrabold text-income">
            {verdict.extraCents > 0
              ? `Cumpliste y te sobraron ${formatArs(verdict.extraCents)}`
              : 'Cumpliste el objetivo de ahorro'}
          </p>
        </>
      )
    case 'short':
      return (
        <>
          {row('Ahorrado', formatArs(verdict.savedCents))}
          {row('Necesario', formatArs(verdict.requiredCents))}
          <p className="mt-1 text-[15px] font-extrabold text-expense">
            {verdict.open
              ? `Te faltan ${formatArs(verdict.missingCents)} este mes`
              : `Te faltaron ${formatArs(verdict.missingCents)}`}
          </p>
          {!point.hasRecords && (
            <p className="text-[14px] leading-5 text-text-muted">
              No hay aportes registrados en este mes.
            </p>
          )}
        </>
      )
  }
}
