import { ChevronRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import moniFace from '@/assets/mascot/expresion_atento.svg'
import { AssistantSheet } from '@/features/assistant/ui/AssistantSheet'
import { useProfile } from '@/features/auth/api/useProfile'
import { useDailyAllowance } from '@/features/dashboard/api/useDailyAllowance'
import { useCategories } from '@/features/categories/api/useCategories'
import { useSavings } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { useAnts } from '@/features/insights/api/useAnts'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { useTrips } from '@/features/trips/api/useTrips'
import { summarizeTrip, tripStatus, tripTimeLabel } from '@/features/trips/domain/trip'
import { FEATURES } from '@/shared/config/features'
import { formatArs, formatCompact } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'

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

function tripLabelOf(
  trip: { startsOn: string; endsOn: string; budgetCents: number },
  today: string,
): string {
  return tripTimeLabel(trip, summarizeTrip(trip, [], today), today)
}

/** A figure for a half-width cell: whole pesos up to a million, then short ("$3,5 M"). */
function big(cents: number): string {
  return Math.abs(cents) >= 100_000_000 ? `$${formatCompact(cents).replace('M', ' M')}` : formatArs(cents)
}

const FOCUS = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-ink'

/** One cell of the grid: the whole cell is the link. No cards: thin lines between cells. */
function Cell({
  to,
  title,
  value,
  sub,
  tone,
  index,
  children,
}: {
  to: string
  title: string
  value: string
  sub?: string
  tone?: 'bad'
  index: number
  children?: ReactNode
}) {
  return (
    <li className={cn('min-w-0 border-line', index % 2 === 0 ? 'border-r' : '', index < 4 ? 'border-b' : '')}>
      <Link
        to={to}
        className={cn('relative flex h-full min-h-[116px] flex-col justify-start gap-1 py-4', index % 2 === 0 ? 'pr-4' : 'pl-4', FOCUS)}
      >
        <span className="text-[15px] font-bold leading-5 text-text-muted">{title}</span>
        <span
          className={cn(
            'mt-1 block whitespace-nowrap font-display text-[clamp(22px,7vw,34px)] font-extrabold leading-[1.05] tracking-[-0.02em]',
            tone === 'bad' && 'text-expense',
          )}
        >
          {value}
        </span>
        {sub && <span className="line-clamp-2 text-[14px] leading-5 text-text-muted">{sub}</span>}
        {children}
      </Link>
    </li>
  )
}

const ROW =
  'flex min-h-[56px] w-full items-center gap-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-ink'

function MoreRow({ to, title, value, onClick }: { to?: string; title: string; value: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="shrink-0 whitespace-nowrap font-display text-[clamp(17px,5vw,19px)] font-extrabold tracking-[-0.01em]">{title}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[14px] text-text-muted">{value}</span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" strokeWidth={2.25} />
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className={ROW}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={ROW}>
          {inner}
        </button>
      )}
    </li>
  )
}

const BARS = [40, 70, 50, 100, 36]

export function MorePage() {
  const today = todayIso()
  const profile = useProfile()
  const [asking, setAsking] = useState(false)

  const savings = useSavings()
  const subscriptions = useSubscriptions()
  const categories = useCategories()
  const trips = useTrips()
  const ants = useAnts(today)
  const budget = useDailyAllowance()

  const goalTotals = activeTotals(savings.data?.goals ?? [])
  const goalShare =
    goalTotals.targetCents > 0
      ? Math.round(Math.min(1, goalTotals.reservedCents / goalTotals.targetCents) * 100)
      : null
  // Only monthly subscriptions add up to "por mes": a yearly one would need an estimate.
  const monthlySubs = (subscriptions.data?.subscriptions ?? []).filter(
    (s) => s.status === 'active' && s.period === 'monthly',
  )
  const monthlyTotal = monthlySubs.reduce((sum, s) => sum + s.amountCents, 0)
  const trip = useMemo(() => nextTrip(trips.data ?? [], today), [trips.data, today])
  const tripLabel = trip ? tripLabelOf(trip, today) : null
  const antsTotal = ants.data?.monthTotalCents ?? 0
  const allowance = budget.allowance

  const budgetCell: { value: string; sub: string; tone?: 'bad' } =
    allowance.kind === 'ok'
      ? allowance.overCents > 0
        ? { value: `-${big(allowance.overCents)}`, sub: 'te pasaste', tone: 'bad' }
        : { value: big(Math.max(0, allowance.remainingCents)), sub: 'te queda del presupuesto' }
      : { value: 'Ver', sub: 'armá tu presupuesto' }

  return (
    <section className="pb-4">
      <header className="flex items-start justify-between gap-3 px-5 pt-6">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-text-muted">Tu plata de un vistazo</p>
          <h1 className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight tracking-[-0.02em]">Explorar</h1>
        </div>
        <button
          type="button"
          aria-label="Hablá con Moni"
          onClick={() => setAsking(true)}
          className="grid size-[52px] shrink-0 place-items-center rounded-full bg-[#1D4A3A] ring-2 ring-[#B9A8E8] ring-offset-2 ring-offset-bg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mint-ink"
        >
          <img src={moniFace} alt="" draggable={false} className="w-8" />
        </button>
      </header>

      <div className="mt-4 px-5">
        <ul aria-label="Resumen" className="grid grid-cols-2 border-t border-line">
          <Cell
            index={0}
            to="/metas"
            title="Metas de ahorro"
            value={goalShare !== null ? `${goalShare}%` : 'Ver'}
            sub={goalShare !== null ? `${big(goalTotals.reservedCents)} de ${big(goalTotals.targetCents)}` : 'límites y ahorro'}
          />
          <Cell index={1} to="/presupuesto" title="Presupuesto" {...budgetCell} />
          <Cell
            index={2}
            to="/recurrentes"
            title="Pagos recurrentes"
            value={monthlySubs.length > 0 ? big(monthlyTotal) : '$0'}
            sub={
              monthlySubs.length > 0
                ? `${monthlySubs.length} ${monthlySubs.length === 1 ? 'cobro' : 'cobros'} por mes`
                : 'sin cobros cargados'
            }
          />
          <Cell
            index={3}
            to="/hormigas"
            title="Gastos hormiga"
            value={antsTotal > 0 ? big(antsTotal) : '0'}
            sub={antsTotal > 0 ? 'este mes' : 'sin hormigas'}
          />
          <Cell index={4} to="/este-mes" title="Informes" value="Mes y año">
            <span aria-hidden="true" className="absolute bottom-3 right-0 flex h-9 items-end gap-1.5">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className={cn('w-2.5 rounded-full', i === 3 ? 'bg-[#4C8B5E]' : 'bg-forest/15 dark:bg-white/15')}
                  style={{ height: `${h}%` }}
                />
              ))}
            </span>
          </Cell>
          <Cell
            index={5}
            to="/viajes"
            title="Viajes"
            value="Ver"
            sub={trip && tripLabel ? `${trip.name} · ${tripLabel}` : 'presupuesto y gastos'}
          />
        </ul>

        <h2 className="mt-7 text-[13px] font-bold uppercase tracking-[0.14em] text-text-muted">Más</h2>
        <ul className="mt-1 divide-y divide-line">
          <MoreRow to="/categorias" title="Categorías" value={(categories.data ?? []).length > 0 ? 'Editar' : 'Creá las tuyas'} />
          <MoreRow title="¿Me conviene?" value="Preguntale a Moni" onClick={() => setAsking(true)} />
          <MoreRow to="/tarjetas/simulador" title="Simulador de cuotas" value="Simulá una compra" />
          {FEATURES.debts && <MoreRow to="/deudas" title="Deudas" value="Lo que debés y te deben" />}
          {FEATURES.aguinaldo && <MoreRow to="/aguinaldo" title="Aguinaldo" value="Repartilo" />}
          {FEATURES.pro && <MoreRow to="/pro" title="Integraciones" value="Billeteras y bancos" />}
        </ul>
      </div>

      {asking && (
        <AssistantSheet
          name={profile.data?.display_name ?? null}
          initialDraft="Quiero comprar algo de $ ¿Me conviene?"
          onClose={() => setAsking(false)}
        />
      )}
    </section>
  )
}
