import { ChevronRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAhorros } from '@/features/ahorros/api/useAhorros'
import { balanceOf, formatSaving } from '@/features/ahorros/domain/ahorros'
import { useFinancialHealth } from '@/features/health/api/useFinancialHealth'
import { BAND_LABELS } from '@/features/health/domain/healthScore'
import { useSavings } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { useAnts } from '@/features/insights/api/useAnts'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { usePlanAccess } from '@/features/plus/api/usePlanAccess'
import type { PlusFeature } from '@/features/plus/domain/entitlements'
import { PlusPromoDialog } from '@/features/plus/ui/PlusPromoDialog'
import { PlusTagMark } from '@/features/plus/ui/PlusTag'
import { useSecondaryCurrency } from '@/features/settings/api/useSecondaryCurrency'
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
/** Surfaces of Explorar: dark green (Ahorros), soft green (Metas, some tiles) and cream, all with their dark-mode pair. */
const DARK_GREEN = 'bg-[linear-gradient(140deg,#0B3D2E_0%,#145240_100%)] text-cream dark:bg-[linear-gradient(140deg,#14503C_0%,#1F6A50_100%)]'
const SOFT_GREEN = 'bg-mint-soft'
const CREAM = 'bg-card'
const TILE = CREAM
const CARD =
  'relative block min-w-0 w-full rounded-[26px] shadow-[0_8px_22px_-16px_rgba(12,36,24,0.35)] dark:border dark:border-white/[0.06] dark:shadow-none'

/** The round arrow of every card: the whole card is the link, this only says so. */
function Go({ onDark = false, onSoft = false }: { onDark?: boolean; onSoft?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-full',
        onDark ? 'bg-white/15 text-cream' : onSoft ? 'bg-white/60 text-mint-ink dark:bg-white/10 dark:text-lime' : 'bg-sand text-text-muted',
      )}
    >
      <ChevronRight className="size-4" strokeWidth={2.4} />
    </span>
  )
}

/** One of the square cards of the grid. */
function Tile({
  to,
  title,
  value,
  sub,
  tone,
  surface = TILE,
  children,
  plus,
}: {
  to: string
  title: string
  value: string
  sub: string
  tone?: 'bad'
  surface?: string
  children?: ReactNode
  /** A Moni Plus capability: a Free person sees the small PLUS label and the promo instead of the screen. */
  plus?: PlusCardGate
}) {
  const className = cn(CARD, surface, 'flex min-h-[150px] flex-col gap-1 p-4 text-left', FOCUS)
  const inner = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className={cn('text-[15px] font-extrabold leading-[19px]', surface === DARK_GREEN ? 'text-cream' : 'text-ink')}>{title}</span>
          {plus?.locked && <PlusTagMark />}
        </span>
        <Go onDark={surface === DARK_GREEN} onSoft={surface === SOFT_GREEN} />
      </span>
      <span
        className={cn(
          'mt-auto block whitespace-nowrap font-display text-[clamp(22px,7.4vw,30px)] font-extrabold leading-[1.05] tracking-[-0.02em]',
          tone === 'bad' ? 'text-expense' : surface === DARK_GREEN ? 'text-cream' : 'text-ink',
        )}
      >
        {value}
      </span>
      <span className={cn('line-clamp-2 min-h-[18px] text-[13px] leading-[18px]', surface === DARK_GREEN ? 'text-[#D4DCCB]' : 'text-text-muted')}>{sub}</span>
      {children}
    </>
  )
  if (plus?.locked) {
    return (
      <button type="button" onClick={() => plus.onLocked(plus.feature)} className={className}>
        {inner}
      </button>
    )
  }
  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  )
}

interface PlusCardGate {
  feature: PlusFeature
  /** True for a Free person: the card stays, with its PLUS label, and opens the promo. */
  locked: boolean
  onLocked: (feature: PlusFeature) => void
}

export function MorePage() {
  const today = todayIso()

  const savings = useSavings()
  const subscriptions = useSubscriptions()
  const trips = useTrips()
  const ants = useAnts(today)
  const ahorros = useAhorros()
  const health = useFinancialHealth()
  const { usesUsd } = useSecondaryCurrency()
  const access = usePlanAccess()
  const [promo, setPromo] = useState<PlusFeature | null>(null)
  const gate = (feature: PlusFeature): PlusCardGate => ({ feature, locked: !access.canUse(feature), onLocked: setPromo })
  const arsSaved = balanceOf(ahorros.data ?? [], 'ARS')
  const usdSaved = balanceOf(ahorros.data ?? [], 'USD')

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

  const moreRows = FEATURES.debts || FEATURES.aguinaldo || FEATURES.pro

  return (
    <section className="flex flex-col gap-3 px-5 pb-4">
      <header className="pt-6">
        <p className="text-[15px] font-semibold text-text-muted">Tu plata de un vistazo</p>
        <h1 className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight tracking-[-0.02em]">Explorar</h1>
      </header>

      <Link to="/metas" className={cn(CARD, CREAM, 'flex items-center gap-4 p-4', FOCUS)}>
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

      <HealthCard locked={!access.canUse('health')} onLocked={() => setPromo('health')}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[17px] font-extrabold leading-5">
            Salud financiera
            {!access.canUse('health') && <PlusTagMark />}
          </span>
          <span className="mt-0.5 block text-[13px] leading-[18px] text-[#D4DCCB]">
            {health.score.kind === 'ok'
              ? `${health.score.score} de 100 · ${BAND_LABELS[health.score.band]}`
              : health.isLoading
                ? '…'
                : 'Cargá tus ingresos para medirla'}
          </span>
        </span>
        <Go onDark />
      </HealthCard>

      <ul className="grid grid-cols-2 gap-3">
        <li className="flex">
          <Tile
            to="/ahorros"
            title="Ahorros"
            surface={CREAM}
            value={ahorros.isLoading ? '…' : big(arsSaved)}
            sub={usdSaved > 0 ? formatSaving(usdSaved, 'USD') : usesUsd ? 'Pesos y dólares' : 'Lo que ahorrás'}
          />
        </li>
        <li className="flex">
          <Tile to="/categorias" title="Categorías" surface={SOFT_GREEN} value="Límite" sub="por mes" />
        </li>
        <li className="flex">
            <Tile
              to="/viajes"
              title="Viajes"
              surface={SOFT_GREEN}
              value={tripCard ? tripCard.value : '0'}
              sub={tripCard ? tripCard.sub : 'todavía no tenés viajes'}
            />
        </li>
        <li className="flex">
            <Tile
              to="/recurrentes"
              plus={gate('recurring')}
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
              plus={gate('ants')}
              title="Gastos hormiga"
              value={antsTotal > 0 ? big(antsTotal) : '0'}
              sub={antsTotal > 0 ? 'este mes' : ants.data ? 'sin hormigas' : 'todavía sin datos'}
            />
        </li>
        <li className="flex">
            <Tile to="/este-mes" plus={gate('reports')} title="Informes" value="Mes y año" sub="tu resumen" surface={SOFT_GREEN} />
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
      {promo && <PlusPromoDialog feature={promo} onClose={() => setPromo(null)} />}
    </section>
  )
}

/** The Salud financiera card: a link, or (Free) a button that opens the Plus promo. */
function HealthCard({ locked, onLocked, children }: { locked: boolean; onLocked: () => void; children: ReactNode }) {
  const className = cn(CARD, DARK_GREEN, 'flex items-center gap-4 p-4 text-left', FOCUS)
  if (locked) {
    return (
      <button type="button" onClick={onLocked} className={className}>
        {children}
      </button>
    )
  }
  return (
    <Link to="/salud" className={className}>
      {children}
    </Link>
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
