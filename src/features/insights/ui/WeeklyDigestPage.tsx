import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotUrl from '@/assets/mascot/expresion_picaro.svg'
import { usePeriodSummary } from '@/features/dashboard/api/useMonthSummary'
import { formatDayMonth } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { argentinaTodayIso, monthStart } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useAnts } from '../api/useAnts'
import { compareWeeks, previousWeek, weekOf, type WeeklyComparison } from '../domain/weekly'

const TOP_CATEGORIES = 3

function comparisonText(c: WeeklyComparison): string {
  switch (c.direction) {
    case 'none':
      return 'Todavía no hay gastos esta semana ni la anterior.'
    case 'new':
      return 'La semana pasada no tuviste gastos.'
    case 'same':
      return 'Igual que la semana pasada.'
    case 'up':
      return `${c.deltaPercent}% más que la semana pasada.`
    case 'down':
      return `${Math.abs(c.deltaPercent ?? 0)}% menos que la semana pasada.`
  }
}

// Screen 032 — Resumen semanal. Real data for the current week (Monday to Sunday, Argentina time)
// against the previous one. There is no scheduling or push yet: the screen is opened by hand.
export function WeeklyDigestPage() {
  const navigate = useNavigate()
  const today = argentinaTodayIso()
  const week = weekOf(today)
  const before = previousWeek(week)
  const current = usePeriodSummary(week.from, week.to)
  const previous = usePeriodSummary(before.from, before.to)
  const ants = useAnts(monthStart(today))

  const comparison = current.data
    ? compareWeeks(current.data.expenseCents, previous.data?.expenseCents ?? 0)
    : null
  const top = [...(current.data?.byCategory ?? [])]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, TOP_CATEGORIES)

  return (
    <main className="min-h-dvh bg-forest px-4 pb-8 pt-10 text-cream">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          {formatDayMonth(week.from)} al {formatDayMonth(week.lastDay)}
        </p>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => navigate(-1)}
          className="flex size-10 items-center justify-center rounded-full bg-surface"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      <h1 className="mt-6 font-display text-[32px] font-extrabold">Resumen semanal</h1>

      {current.isLoading ? (
        <div
          role="status"
          aria-label="Cargando resumen semanal"
          className="mt-5 flex flex-col gap-4"
        >
          <Skeleton className="h-36 rounded-[24px] bg-surface" />
          <Skeleton className="h-44 rounded-[24px] bg-surface" />
        </div>
      ) : current.isError || !current.data || !comparison ? (
        <EmptyState
          className="text-cream"
          mascotUrl={mascotAlert}
          title="No pudimos cargar tu semana"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={() => void current.refetch()}>Reintentar</Button>}
        />
      ) : (
        <>
          <section className="mt-5 rounded-[24px] bg-cream p-5 text-forest shadow-lg">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
              Gastaste en la semana
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="font-display text-[40px] font-extrabold leading-[48px]">
                {formatArs(current.data.expenseCents)}
              </p>
              {comparison.deltaPercent !== null && comparison.direction !== 'same' && (
                <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[15px] font-extrabold">
                  {comparison.direction === 'up' ? (
                    <ArrowUp aria-hidden="true" className="size-4" />
                  ) : (
                    <ArrowDown aria-hidden="true" className="size-4" />
                  )}
                  {comparison.deltaPercent > 0 ? '+' : ''}
                  {comparison.deltaPercent}%
                </span>
              )}
            </div>
            <p className="mt-1 text-[16px] leading-6 text-text-muted">
              {comparisonText(comparison)}
            </p>
            {previous.data && (
              <p className="text-[15px] text-text-muted">
                Semana pasada: {formatArs(previous.data.expenseCents)}
              </p>
            )}
          </section>

          <section className="mt-4 rounded-[24px] bg-surface p-4" aria-labelledby="top-title">
            <h2 id="top-title" className="text-[20px] font-extrabold">
              Donde más se fue
            </h2>
            {top.length === 0 ? (
              <p className="mt-2 text-[16px] text-text-muted-on-dark">
                Cuando cargues gastos esta semana, acá ves en qué categorías se van.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-white/10">
                {top.map((c) => (
                  <li key={c.categoryId} className="flex items-center gap-3 py-3">
                    <CategoryIconCircle iconName={c.icon} color={c.color} className="size-11" />
                    <span className="min-w-0 flex-1 truncate text-[17px] font-extrabold">
                      {c.name}
                    </span>
                    <span className="text-[17px] font-extrabold">{formatArs(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Link
        to="/hormigas"
        className="mt-4 flex items-center gap-3 rounded-[24px] bg-surface p-4"
        aria-label="Ver gastos hormiga"
      >
        <img src={mascotUrl} alt="" className="size-12 rounded-[12px] bg-lime p-1" />
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-extrabold">Tus gastos hormiga</span>
          <span className="block text-[15px] text-text-muted-on-dark">
            {ants.data
              ? ants.data.groups.length === 0
                ? 'Este mes no se repite ninguno. Bien ahí.'
                : `${formatArs(ants.data.monthTotalCents)} este mes en cositas chicas que se repiten.`
              : 'Mirá las cositas chicas que se repiten.'}
          </span>
        </span>
        <span className="text-[15px] font-extrabold text-lime">Ver</span>
      </Link>

      <p className="mt-6 text-[14px] leading-5 text-text-muted-on-dark">
        Por ahora el resumen se mira acá, a mano. Los avisos automáticos llegan más adelante.
      </p>
    </main>
  )
}
