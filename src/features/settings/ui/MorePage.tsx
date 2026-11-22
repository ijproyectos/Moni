import { ChevronRight } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useDailyAllowance } from '@/features/dashboard/api/useDailyAllowance'
import { useSavings } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { useAnts } from '@/features/insights/api/useAnts'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { useTrips } from '@/features/trips/api/useTrips'
import { daysBetween } from '@/features/trips/domain/dates'
import { tripStatus } from '@/features/trips/domain/trip'
import { FEATURES } from '@/shared/config/features'
import { formatArs, formatCompact } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { ProgressRing } from '@/shared/ui/ProgressRing'

/** Date of today's trip headline: the ongoing trip, else the nearest one that has not started. */
function nextTrip<T extends { startsOn: string; endsOn: string; archivedAt: string | null }>(
  trips: readonly T[],
  today: string,
): T | undefined {
  const live = trips.filter((t) => !t.archivedAt && t.endsOn >= today)
  return (
    live.find((t) => tripStatus(t, today) === 'ongoing') ??
    live.sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]
  )
}

/** The big figure and caption of the trip card: days to go for the next trip, or "En curso". Nothing is made up without a trip. */
function tripFigure(
  trip: { name: string; startsOn: string; endsOn: string; archivedAt: string | null },
  today: string,
): { value: string; sub: string } {
  if (tripStatus(trip as never, today) === 'ongoing') {
    const left = Math.max(1, daysBetween(today, trip.endsOn))
    return { value: 'En curso', sub: `${trip.name} · ${left === 1 ? 'último día' : `quedan ${left} días`}` }
  }
  const away = daysBetween(today, trip.startsOn) - 1
  return { value: away <= 0 ? 'Hoy' : away === 1 ? '1 día' : `${away} días`, sub: trip.name }
}

/** A figure for a half-width card: whole pesos up to a million, then short ("$3,5 M"). */
function big(cents: number): string {
  return Math.abs(cents) >= 100_000_000 ? `$${formatCompact(cents).replace('M', ' M')}` : formatArs(cents)
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink dark:focus-visible:outline-lime'
const CARD =
  'relative block min-w-0 w-full rounded-[26px] bg-card shadow-[0_8px_22px_-16px_rgba(12,36,24,0.35)] dark:border dark:border-white/[0.06] dark:shadow-none'

/** The round arrow of every card: the whole card is the link, this only says so. */
function Go({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-full',
        onDark ? 'bg-white/15 text-cream' : 'bg-sand text-text-muted',
      )}
    >
      <ChevronRight className="size-4" strokeWidth={2.4} />
    </span>
  )
}

/** One of the four square cards of the grid. */
function Tile({
  to,
  title,
  value,
  sub,
  tone,
  children,
}: {
  to: string
  title: string
  value: string
  sub: string
  tone?: 'bad'
  children?: ReactNode
}) {
  return (
    <Link to={to} className={cn(CARD, 'flex min-h-[150px] flex-col gap-1 p-4', FOCUS)}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[15px] font-extrabold leading-[19px] text-ink">{title}</span>
        <Go />
      </span>
      <span
        className={cn(
          'mt-auto block whitespace-nowrap font-display text-[clamp(22px,7.4vw,30px)] font-extrabold leading-[1.05] tracking-[-0.02em]',
          tone === 'bad' ? 'text-expense' : 'text-ink',
        )}
      >
        {value}
      </span>
      <span className="line-clamp-2 min-h-[18px] text-[13px] leading-[18px] text-text-muted">{sub}</span>
      {children}
    </Link>
  )
}

const BARS = [40, 70, 50, 100, 36]

export function MorePage() {
  const today = todayIso()

  const savings = useSavings()
  const subscriptions = useSubscriptions()
  const trips = useTrips()
  const ants = useAnts(today)
  const budget = useDailyAllowance()

  const goalTotals = activeTotals(savings.data?.goals ?? [])
  const hasGoals = goalTotals.targetCents > 0
  const goalShare = hasGoals ? Math.min(1, goalTotals.reservedCents / goalTotals.targetCents) : 0
  // Only monthly subscriptions add up to "por mes": a yearly one would need an estimate.
  const monthlySubs = (subscriptions.data?.subscriptions ?? []).filter(
    (s) => s.status === 'active' && s.period === 'monthly',
  )
  const monthlyTotal = monthlySubs.reduce((sum, s) => sum + s.amountCents, 0)
  const trip = useMemo(() => nextTrip(trips.data ?? [], today), [trips.data, today])
  const tripCard = trip ? tripFigure(trip, today) : null
  const antsTotal = ants.data?.monthTotalCents ?? 0
  const allowance = budget.allowance

  const moreRows = FEATURES.debts || FEATURES.aguinaldo || FEATURES.pro

  // The budget card keeps the existing allowance logic; the bar is what was spent of what the month allows.
  const hero =
    allowance.kind === 'ok'
      ? {
          value: allowance.overCents > 0 ? `-${big(allowance.overCents)}` : big(Math.max(0, allowance.remainingCents)),
          sub: allowance.overCents > 0 ? 'te pasaste este mes' : 'te queda del presupuesto este mes',
          over: allowance.overCents > 0,
          progress:
            allowance.overCents > 0 || allowance.spendBudgetCents <= 0
              ? 1
              : Math.min(1, Math.max(0, allowance.spentCents / allowance.spendBudgetCents)),
        }
      : null

  return (
    <section className="flex flex-col gap-3 px-5 pb-4">
      <header className="pt-6">
        <p className="text-[15px] font-semibold text-text-muted">Tu plata de un vistazo</p>
        <h1 className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight tracking-[-0.02em]">Explorar</h1>
      </header>

      <Link
        to="/presupuesto"
        className={cn(
          'relative mt-1 flex min-h-[170px] flex-col rounded-[28px] p-5 text-cream',
          'bg-[linear-gradient(140deg,#0B3D2E_0%,#10382B_55%,#1D4A3A_100%)] dark:bg-[linear-gradient(140deg,#16261c_0%,#1c3a2c_55%,#2b5a47_100%)]',
          'shadow-[0_14px_30px_-18px_rgba(11,61,46,0.7)] dark:shadow-none dark:ring-1 dark:ring-white/[0.07]',
          FOCUS,
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-[16px] font-extrabold leading-5">Presupuesto</span>
          <Go onDark />
        </span>
        {hero ? (
          <>
            <span className="mt-3 block whitespace-nowrap font-display text-[clamp(34px,11vw,46px)] font-extrabold leading-none tracking-[-0.03em]">
              {hero.value}
            </span>
            <span
              role="progressbar"
              aria-label="Presupuesto gastado del mes"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hero.progress * 100)}
              className="mt-4 block h-[5px] w-full overflow-hidden rounded-full bg-white/15"
            >
              <span
                className={cn('block h-full rounded-full', hero.over ? 'bg-[#D9785A]' : 'bg-lime')}
                style={{ width: `${Math.round(hero.progress * 100)}%` }}
              />
            </span>
            <span className="mt-2 block text-[13px] font-semibold text-text-muted-on-dark">{hero.sub}</span>
          </>
        ) : (
          <>
            <span className="mt-4 block font-display text-[clamp(26px,8vw,32px)] font-extrabold leading-tight tracking-[-0.02em]">
              {budget.isLoading ? '…' : 'Configurá tu presupuesto'}
            </span>
            <span className="mt-auto block pt-3 text-[13px] font-semibold text-text-muted-on-dark">
              {budget.isLoading ? '' : 'Tocá para armarlo con tus ingresos'}
            </span>
          </>
        )}
      </Link>

      <Link to="/metas" className={cn(CARD, 'flex items-center gap-4 p-4', FOCUS)}>
        <span aria-hidden="true" className="shrink-0">
          <ProgressRing value={goalShare} label={`${Math.floor(goalShare * 100)}%`} size={64} stroke={7} className={cn(!hasGoals && 'opacity-60')} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-extrabold leading-5">Metas de ahorro</span>
          <span className="mt-0.5 block text-[13px] leading-[18px] text-text-muted">
            {hasGoals
              ? `${big(goalTotals.reservedCents)} de ${big(goalTotals.targetCents)}`
              : savings.isLoading
                ? '…'
                : 'Creá tu primera meta'}
          </span>
        </span>
        <Go />
      </Link>

      <ul className="grid grid-cols-2 gap-3">
        <li className="flex">
            <Tile
              to="/viajes"
              title="Viajes"
              value={tripCard ? tripCard.value : '0'}
              sub={tripCard ? tripCard.sub : 'todavía no tenés viajes'}
            />
        </li>
        <li className="flex">
            <Tile
              to="/recurrentes"
              title="Pagos recurrentes"
              value={monthlySubs.length > 0 ? big(monthlyTotal) : '$0'}
              sub={
                monthlySubs.length > 0
                  ? `${monthlySubs.length} ${monthlySubs.length === 1 ? 'cobro' : 'cobros'} por mes`
                  : 'no tenés pagos próximos'
              }
            />
        </li>
        <li className="flex">
            <Tile
              to="/hormigas"
              title="Gastos hormiga"
              value={antsTotal > 0 ? big(antsTotal) : '0'}
              sub={antsTotal > 0 ? 'este mes' : ants.data ? 'sin hormigas' : 'todavía sin datos'}
            />
        </li>
        <li className="flex">
            <Tile to="/este-mes" title="Informes" value="Mes y año" sub="tu resumen">
              <span aria-hidden="true" className="absolute bottom-4 right-4 flex h-8 items-end gap-1">
                {BARS.map((h, i) => (
                  <span
                    key={i}
                    className={cn('w-2 rounded-full', i === 3 ? 'bg-[#4C8B5E]' : 'bg-forest/15 dark:bg-white/15')}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </span>
            </Tile>
        </li>
      </ul>

      {moreRows && (
        <>
          <h2 className="mt-4 text-[13px] font-bold uppercase tracking-[0.14em] text-text-muted">Más</h2>
          <ul className="divide-y divide-line">
            {FEATURES.debts && <MoreRow to="/deudas" title="Deudas" value="Lo que debés y te deben" />}
            {FEATURES.aguinaldo && <MoreRow to="/aguinaldo" title="Aguinaldo" value="Repartilo" />}
            {FEATURES.pro && <MoreRow to="/pro" title="Integraciones" value="Billeteras y bancos" />}
          </ul>
        </>
      )}
    </section>
  )
}

const ROW =
  'flex min-h-[56px] w-full items-center gap-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-ink'

function MoreRow({ to, title, value }: { to: string; title: string; value: string }) {
  return (
    <li>
      <Link to={to} className={ROW}>
        <span className="shrink-0 whitespace-nowrap font-display text-[clamp(17px,5vw,19px)] font-extrabold tracking-[-0.01em]">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[14px] text-text-muted">{value}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" strokeWidth={2.25} />
      </Link>
    </li>
  )
}
