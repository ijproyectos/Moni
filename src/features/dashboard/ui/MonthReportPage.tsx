import { Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AssistantEntryLink } from '@/features/assistant/ui/AssistantEntryLink'
import { formatMonthName, formatMonthYear } from '@/shared/lib/dates'
import { monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MonthPicker } from '@/shared/ui/MonthPicker'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useMonthSummaries } from '../api/useMonthSummary'
import {
  SAVINGS_GOAL_PERCENT,
  barScale,
  groupCategories,
  lastMonths,
  mergeCategories,
  savingsSummary,
  type MonthTotals,
} from '../domain/stats'
import { CategoryDonut } from './CategoryDonut'

type Range = 'month' | 'six' | 'year'

const BAR_AREA = 100

/** Months of each range. "Mes" keeps the six months ending at the chosen one for the bars. */
function monthsFor(range: Range, selected: string, latest: string): { shown: string[]; bars: string[] } {
  if (range === 'month') return { shown: [selected], bars: lastMonths(selected, 6) }
  if (range === 'six') {
    const six = lastMonths(latest, 6)
    return { shown: six, bars: six }
  }
  const year = latest.slice(0, 4)
  const count = Number(latest.slice(5, 7))
  const ytd = Array.from({ length: count }, (_, i) => shiftMonth(`${year}-01-01`, i))
  return { shown: ytd, bars: ytd }
}

/** Estadísticas (screen 23, at /este-mes): Mes / 6 meses / Año, spending by category, expenses vs income and savings. */
export function MonthReportPage() {
  const latest = monthStart(todayIso())
  const [selected, setSelected] = useState(latest)
  const [range, setRange] = useState<Range>('month')
  const { shown, bars } = useMemo(() => monthsFor(range, selected, latest), [range, selected, latest])
  const all = useMemo(() => [...new Set([...shown, ...bars])], [shown, bars])
  const queries = useMonthSummaries(all)
  const byMonth = new Map(all.map((m, i) => [m, queries[i]?.data]))
  const loading = queries.some((q) => q.isLoading)

  const shownData = shown.flatMap((m) => {
    const d = byMonth.get(m)
    return d ? [d] : []
  })
  const slices = groupCategories(mergeCategories(shownData.map((d) => d.byCategory)))
  const expenseTotal = shownData.reduce((s, d) => s + d.expenseCents, 0)
  const totals: MonthTotals[] = bars.map((m) => ({
    month: m,
    incomeCents: byMonth.get(m)?.incomeCents ?? 0,
    expenseCents: byMonth.get(m)?.expenseCents ?? 0,
  }))
  const scale = barScale(totals)
  const savings = savingsSummary(
    shown.flatMap((m) => {
      const d = byMonth.get(m)
      return d ? [{ month: m, incomeCents: d.incomeCents, expenseCents: d.expenseCents }] : []
    }),
  )
  const subtitle = range === 'month' ? formatMonthYear(selected) : range === 'six' ? 'Últimos 6 meses' : `Año ${latest.slice(0, 4)}`

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader title="Estadísticas" subtitle={subtitle} fallbackTo="/" />
      <SegmentedControl
        label="Período"
        variant="menta"
        value={range}
        onChange={setRange}
        options={[
          { value: 'month', label: 'Mes' },
          { value: 'six', label: '6 meses' },
          { value: 'year', label: 'Año' },
        ]}
      />
      {range === 'month' && (
        <div className="-my-1 flex justify-center">
          <MonthPicker value={selected} latest={latest} onChange={setSelected} tone="light" />
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Cargando estadísticas" className="flex flex-col gap-3">
          <Skeleton className="h-52 rounded-[26px]" />
          <Skeleton className="h-40 rounded-[26px]" />
        </div>
      ) : (
        <>
          <section aria-label="Por categoría" className="flex flex-col gap-2.5 rounded-[26px] bg-card px-4 py-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold">Por categoría</h2>
              <AmountDisplay cents={expenseTotal} className="text-[14px] font-semibold" />
            </div>
            {slices.length > 0 ? (
              <CategoryDonut slices={slices} />
            ) : (
              <p className="text-[13.5px] text-text-muted">Todavía no hay gastos en este período.</p>
            )}
          </section>

          <section aria-label="Gastos vs ingresos" className="flex flex-col gap-2.5 rounded-[26px] bg-card px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-bold">Gastos vs ingresos</h2>
              <span className="flex gap-2.5 text-[11.5px] text-[#4F6157] dark:text-text-muted">
                <span className="flex items-center gap-1">
                  <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-mint" />
                  Gastos
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-[#CDEBD9] dark:bg-mint-soft" />
                  Ingresos
                </span>
              </span>
            </div>
            <div
              role="img"
              aria-label={`Gastos e ingresos por mes: ${totals
                .map((t) => formatMonthName(t.month))
                .join(', ')}`}
              className="grid items-end gap-2.5"
              style={{ height: BAR_AREA, gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}
            >
              {scale.map((s, i) => {
                const current = totals[i]?.month === latest
                return (
                  <div key={totals[i]?.month} aria-hidden="true" className="flex h-full items-end justify-center gap-[3px]">
                    <span
                      className={cn('w-3 rounded-full', current ? 'bg-[#8FD6AE]' : 'bg-mint')}
                      style={{ height: Math.max(3, Math.round(s.expense * BAR_AREA)) }}
                    />
                    <span
                      className="w-3 rounded-full bg-[#CDEBD9] dark:bg-mint-soft"
                      style={{ height: Math.max(3, Math.round(s.income * BAR_AREA)) }}
                    />
                  </div>
                )
              })}
            </div>
            <div
              aria-hidden="true"
              className="grid gap-2.5 text-center text-[11.5px] text-text-muted"
              style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}
            >
              {totals.map((t) => (
                <span key={t.month}>{formatMonthName(t.month).slice(0, 3)}</span>
              ))}
            </div>
          </section>

          <section aria-label="Ahorro" className="flex items-center gap-3 rounded-3xl bg-gold px-3.5 py-3">
            <span
              aria-hidden="true"
              className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-white text-[#5A4300]"
            >
              <Target className="size-[17px]" strokeWidth={2} />
            </span>
            {savings ? (
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#3D2E00]">
                  {savings.percent > 0
                    ? `Ahorrás el ${savings.percent}% de tus ingresos`
                    : 'Gastaste más de lo que ingresó'}
                </p>
                <p className="text-[12.5px] text-[#5A4300]">
                  <AmountDisplay cents={Math.abs(savings.monthlyAverageCents)} /> por mes en promedio · meta{' '}
                  {SAVINGS_GOAL_PERCENT}%
                </p>
              </div>
            ) : (
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#3D2E00]">Todavía no sabemos cuánto ahorrás</p>
                <p className="text-[12.5px] text-[#5A4300]">Cargá tus ingresos para ver el porcentaje · meta {SAVINGS_GOAL_PERCENT}%</p>
              </div>
            )}
          </section>

          <div className="flex flex-col gap-2.5">
            <Link
              to="/tu-anio"
              replace
              className={cn('rounded-full bg-card px-4 py-3 text-center text-[14px] font-semibold', FOCUS_RING)}
            >
              Tu año
            </Link>
            <AssistantEntryLink />
          </div>
        </>
      )}
    </section>
  )
}
