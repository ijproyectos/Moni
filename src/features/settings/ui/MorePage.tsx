import { ChevronRight, Gift, HandCoins, Plug, type LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useDailyAllowance } from '@/features/dashboard/api/useDailyAllowance'
import { useCategories } from '@/features/categories/api/useCategories'
import { useSavings } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { useAnts } from '@/features/insights/api/useAnts'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { useTrips } from '@/features/trips/api/useTrips'
import { summarizeTrip, tripStatus, tripTimeLabel } from '@/features/trips/domain/trip'
import { FEATURES } from '@/shared/config/features'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
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

const CARD =
  'flex min-h-[148px] w-[min(78%,300px)] min-w-[232px] shrink-0 snap-start flex-col justify-between gap-3 rounded-[26px] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

function CarouselCard({ to, title, tone, children }: { to: string; title: string; tone: 'violet' | 'paper' | 'green'; children: ReactNode }) {
  const tones = {
    violet: 'bg-[#E3DFF5] text-[#2B2A5C] dark:bg-[#2A2A55] dark:text-[#D9D4F5]',
    paper: 'border border-line bg-card text-ink',
    green: 'bg-[#D3E6D2] text-[#0B3D2E] dark:bg-[#1F3A2C] dark:text-[#CFE9D6]',
  }
  return (
    <Link to={to} className={cn(CARD, tones[tone])}>
      <span className="font-display text-[17px] font-extrabold leading-tight">{title}</span>
      {children}
    </Link>
  )
}

function ExploreRow({ to, title, value }: { to: string; title: string; value: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-[56px] items-center gap-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-ink"
      >
        <span className="min-w-0 flex-1 truncate font-display text-[19px] font-extrabold tracking-[-0.01em]">{title}</span>
        <span className="min-w-0 max-w-[55%] truncate text-right text-[14px] text-text-muted">{value}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" strokeWidth={2.25} />
      </Link>
    </li>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{children}</h2>
}

interface Item {
  key: string
  /** Carousel card, when it has one. */
  card?: ReactNode
  /** Compact row of Explorar (and of "Más herramientas" when the goals left it out). */
  row: { to: string; title: string; value: ReactNode }
}

export function MorePage() {
  const today = todayIso()

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
  const budgetValue =
    allowance.kind === 'ok'
      ? allowance.overCents > 0
        ? `te pasaste ${formatArs(allowance.overCents)}`
        : `${formatArs(Math.max(0, allowance.spendBudgetCents))} por mes`
      : 'Consultá y administrá'

  const carousel: Item[] = [
    {
      key: 'recurrentes',
      card: (
        <CarouselCard to="/recurrentes" title="Pagos recurrentes" tone="violet">
          <span>
            {monthlySubs.length > 0 && (
              <span className="block font-display text-[48px] font-extrabold leading-[48px]">{monthlySubs.length}</span>
            )}
            <span className="mt-1 block text-[15px] font-bold leading-5">
              {monthlySubs.length > 0 ? (
                <>
                  {monthlySubs.length === 1 ? 'cobro' : 'cobros'} por mes · <AmountDisplay cents={monthlyTotal} />
                </>
              ) : (
                'Sin cobros cargados'
              )}
            </span>
            <span className="block text-[14px] leading-5 opacity-80">Suscripciones y gastos fijos</span>
          </span>
        </CarouselCard>
      ),
      row: { to: '/recurrentes', title: 'Pagos recurrentes', value: 'Suscripciones y gastos fijos' },
    },
    {
      key: 'informes',
      card: (
        <CarouselCard to="/este-mes" title="Informes" tone="paper">
          <span>
            <span aria-hidden="true" className="mb-3 flex h-12 items-end gap-2.5">
              {[40, 70, 50, 100, 36].map((h, i) => (
                <span
                  key={i}
                  className={cn('w-4 rounded-full', i === 3 ? 'bg-[#7CCB8F]' : 'bg-forest/20 dark:bg-white/10')}
                  style={{ height: `${h}%` }}
                />
              ))}
            </span>
            <span className="block text-[14px] text-text-muted">Tu mes y tu año</span>
          </span>
        </CarouselCard>
      ),
      row: { to: '/este-mes', title: 'Informes', value: 'Tu mes y tu año' },
    },
    {
      key: 'metas',
      card: (
        <CarouselCard to="/metas" title="Metas de ahorro" tone="green">
          {goalShare !== null ? (
            <span>
              <span className="block font-display text-[48px] font-extrabold leading-[48px]">{goalShare}%</span>
              <span className="mt-1 block text-[14px] leading-5 opacity-80">
                <AmountDisplay cents={goalTotals.reservedCents} /> de <AmountDisplay cents={goalTotals.targetCents} />
              </span>
            </span>
          ) : (
            <span className="text-[14px] opacity-80">Límites y ahorro</span>
          )}
        </CarouselCard>
      ),
      row: { to: '/metas', title: 'Metas de ahorro', value: goalShare !== null ? `${goalShare}%` : 'Límites y ahorro' },
    },
    ...(FEATURES.debts
      ? [{
          key: 'deudas',
          card: <PlainCard to="/deudas" title="Deudas" subtitle="Lo que debés y te deben" icon={HandCoins} />,
          row: { to: '/deudas', title: 'Deudas', value: 'Lo que debés y te deben' },
        }]
      : []),
    ...(FEATURES.aguinaldo
      ? [{
          key: 'aguinaldo',
          card: <PlainCard to="/aguinaldo" title="Aguinaldo" subtitle="Repartilo" icon={Gift} />,
          row: { to: '/aguinaldo', title: 'Aguinaldo', value: 'Repartilo' },
        }]
      : []),
    ...(FEATURES.pro
      ? [{
          key: 'integraciones',
          card: <PlainCard to="/pro" title="Integraciones" subtitle="Billeteras y bancos" icon={Plug} />,
          row: { to: '/pro', title: 'Integraciones', value: 'Billeteras y bancos' },
        }]
      : []),
  ]
  const explore: Item[] = [
    { key: 'categorias', row: { to: '/categorias', title: 'Categorías', value: (categories.data ?? []).length > 0 ? 'Editar' : 'Creá las tuyas' } },
    {
      key: 'viajes',
      row: { to: '/viajes', title: 'Viajes', value: trip && tripLabel ? `${trip.name} · ${tripLabel}` : 'Presupuesto' },
    },
    {
      key: 'hormigas',
      row: { to: '/hormigas', title: 'Gastos hormiga', value: antsTotal > 0 ? <>{formatArs(antsTotal)} este mes</> : 'Sin hormigas' },
    },
    { key: 'presupuesto', row: { to: '/presupuesto', title: 'Presupuesto', value: budgetValue } },
    { key: 'insights', row: { to: '/insights', title: 'Avisos de Moni', value: 'Lo que detectó en tus gastos' } },
    { key: 'simulador', row: { to: '/tarjetas/simulador', title: 'Simulador de cuotas', value: 'Simulá una compra' } },
  ]

  return (
    <section className="pb-4">
      <header className="flex items-start justify-between gap-3 px-5 pt-6">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-text-muted">Todo en un lugar</p>
          <h1 className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight tracking-[-0.02em]">Herramientas</h1>
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-4">
        <ul aria-label="Herramientas destacadas" className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {carousel.map((i) => (
            <li key={i.key} className="contents">
              {i.card}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 px-5">
          <SectionTitle>Explorar</SectionTitle>
          <ul className="divide-y divide-line">
            {explore.map((i) => (
              <ExploreRow key={i.key} {...i.row} />
            ))}
          </ul>
        </div>
      </div>

    </section>
  )
}

function PlainCard({ to, title, subtitle, icon: Icon }: { to: string; title: string; subtitle: string; icon: LucideIcon }) {
  return (
    <CarouselCard to={to} title={title} tone="paper">
      <span>
        <Icon aria-hidden="true" className="mb-2 size-7 text-mint-ink dark:text-lime" strokeWidth={2} />
        <span className="block text-[14px] text-text-muted">{subtitle}</span>
      </span>
    </CarouselCard>
  )
}
