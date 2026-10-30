import { AssistantEntryLink } from '@/features/assistant/ui/AssistantEntryLink'
import { ArrowDown, ArrowUp, ChevronRight, Wallet } from 'lucide-react'
import { Link } from 'react-router'
import mascotUrl from '@/assets/mascot/personaje_informe-del-mes.svg'
import { formatMonthName, formatMonthShortYear } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { MoniGlyph, Page, Panel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { useMonthSummaries } from '../api/useMonthSummary'

// Screen 035 — Tu año (real data: one month summary per month of the current year).
export function YearReportPage() {
  const current = monthStart(todayIso())
  const year = current.slice(0, 4)
  const monthIndex = Number(current.slice(5, 7))
  const months = Array.from({ length: monthIndex }, (_, i) => shiftMonth(`${year}-01-01`, i))
  const queries = useMonthSummaries(months)
  const totals = months.map((m, i) => ({ month: m, cents: queries[i]?.data?.expenseCents ?? 0 }))
  const closed = totals.slice(0, -1).filter((t) => t.cents > 0)
  const total = totals.reduce((s, t) => s + t.cents, 0)
  const average = closed.length
    ? Math.round(closed.reduce((s, t) => s + t.cents, 0) / closed.length)
    : 0
  const max = Math.max(1, ...totals.map((t) => t.cents))
  const ranked = [...closed].sort((a, b) => b.cents - a.cents)
  const top = ranked[0]
  const lightest = ranked[ranked.length - 1]
  const loading = queries.some((q) => q.isLoading)
  const name = (m: string) => formatMonthName(m)
  const short = (m: string) => name(m).slice(0, 3)
  const vsAverage = (cents: number) =>
    average ? Math.round(((cents - average) / average) * 100) : 0

  return (
    <Page>
      <PageHeader
        title="Tu año"
        action={
          <Link
            to="/este-mes"
            className="flex min-h-11 items-center rounded-full bg-sand px-4 text-[16px] font-extrabold"
          >
            Este mes
          </Link>
        }
      />
      <section className="flex items-center gap-3 rounded-[24px] bg-cream p-5">
        <div className="flex-1">
          <h2 className="text-[24px] font-extrabold">Tu año en plata</h2>
          <p className="text-[16px] leading-6 text-text-muted">
            De enero a {name(current).toLowerCase()}, mes por mes.
          </p>
        </div>
        <img src={mascotUrl} alt="" className="size-24" />
      </section>

      <AssistantEntryLink />

      <Link
        to="/ingresos"
        className="flex min-h-14 items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-lime/40">
          <Wallet aria-hidden="true" className="size-5" />
        </span>
        <span className="flex-1">
          <span className="block text-[18px] font-extrabold">Ingresos por mes</span>
          <span className="block text-[14px] text-text-muted">
            Cuánto te entró cada mes y en el año
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 text-text-muted" />
      </Link>

      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Gastaste en {year}
        </p>
        <p className="font-display text-[40px] font-extrabold">
          {loading ? '…' : formatArs(total)}
        </p>
        <p className="text-[16px] text-text-muted-on-dark">
          En promedio, {formatArs(average)} por mes
        </p>
        <div
          className="relative mt-6 flex h-48 items-end gap-1.5"
          role="img"
          aria-label="Gastos por mes"
        >
          {average > 0 && (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-dashed border-white/40"
              style={{ bottom: `${(average / max) * 100}%` }}
            />
          )}
          {totals.map((t, i) => {
            const isCurrent = i === totals.length - 1
            const isTop = top && t.month === top.month
            return (
              <div
                key={t.month}
                className="relative flex h-full flex-1 flex-col items-center justify-end"
              >
                {isTop && (
                  <span className="absolute -top-6 whitespace-nowrap text-[14px] font-extrabold text-gold">
                    {formatArs(t.cents)}
                  </span>
                )}
                <span
                  className={cn(
                    'w-full rounded-t-[6px]',
                    isCurrent
                      ? 'border-2 border-dashed border-blush bg-transparent'
                      : isTop
                        ? 'bg-gold'
                        : 'bg-blush',
                  )}
                  style={{ height: `${Math.max(isCurrent ? 40 : 4, (t.cents / max) * 100)}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex gap-1.5 text-center text-[13px] text-text-muted-on-dark">
          {totals.map((t) => (
            <span
              key={t.month}
              className={cn('flex-1', top && t.month === top.month && 'font-extrabold text-cream')}
            >
              {short(t.month)}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-text-muted-on-dark">---- Promedio mensual</p>
      </section>

      {top && lightest && (
        <Panel className="flex items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40">
            <MoniGlyph className="size-9" />
          </span>
          <p className="text-[16px] leading-6">
            <strong className="font-extrabold">Sugerido:</strong> {name(top.month).toLowerCase()}{' '}
            fue tu mes más gastador, un {vsAverage(top.cents)}% más que tu promedio. El más liviano
            fue {name(lightest.month).toLowerCase()}, con {formatArs(lightest.cents)}.
          </p>
        </Panel>
      )}

      {ranked.length > 0 && (
        <Panel className="py-1">
          <ul className="divide-y divide-sand">
            {ranked.slice(0, 3).map((t, i) => {
              const pct = vsAverage(t.cents)
              return (
                <li key={t.month} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-gold/40 font-extrabold">
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[18px] font-extrabold">{name(t.month)}</span>
                    <span className="block text-[14px] text-text-muted">
                      vs tu promedio · {formatMonthShortYear(t.month)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-[18px] font-extrabold">{formatArs(t.cents)}</span>
                    <span className="flex items-center gap-0.5 rounded-full bg-gold/45 px-2 py-0.5 text-[13px] font-extrabold">
                      {pct >= 0 ? (
                        <ArrowUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ArrowDown aria-hidden="true" className="size-3.5" />
                      )}
                      {pct >= 0 ? '+' : ''}
                      {pct}%
                    </span>
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
