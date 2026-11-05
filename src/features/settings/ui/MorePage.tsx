import { ChevronDown, ChevronRight, Gift, HandCoins, Plug, ShoppingBasket } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { skinBackground, skinForAccountName } from '@/features/accounts/domain/cardSkins'
import { useAuth } from '@/features/auth/api/authContext'
import { resolveAvatarUrl } from '@/features/auth/domain/avatar'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'
import { useCategories } from '@/features/categories/api/useCategories'
import { useSavings } from '@/features/goals/api/useSavings'
import { activeTotals } from '@/features/goals/domain/savings'
import { useAnts } from '@/features/insights/api/useAnts'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import type { AppFeature } from '@/features/onboarding/domain/goals'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusPill } from '@/features/plus/ui/PlusPill'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { useTrips } from '@/features/trips/api/useTrips'
import { summarizeTrip, tripStatus, tripTimeLabel } from '@/features/trips/domain/trip'
import { FEATURES } from '@/shared/config/features'
import { formatMonthName } from '@/shared/lib/dates'
import { monthStart, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { CompactHeader } from '@/shared/ui/CompactHeader'
import { useScrolledPast } from '@/shared/ui/useScrolledPast'
import { cn } from '@/shared/ui/cn'
import { themedColor } from '@/shared/ui/categoryIcons'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'

/** Fallback chip colors for payment media without a brand of their own. */
const MEDIUM_TONES = ['#2f4a3b', '#c75a1f', '#6b3fd4', '#2f78a8']

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

interface Entry {
  key: string
  feature?: AppFeature
  node: ReactNode
  wide?: boolean
}

type Tone = 'sage' | 'dark' | 'paper' | 'moss'

const TONES: Record<Tone, string> = {
  sage: 'bg-[#dfe5cc] text-ink dark:bg-sand',
  dark: 'bg-[#2f7048] text-cream',
  paper: 'bg-card text-ink',
  moss: 'bg-[#cfdcb7] text-ink dark:bg-[#2c4430]',
}

function MoreCard({
  to,
  title,
  tone,
  children,
  className,
}: {
  to: string
  title: string
  tone: Tone
  children?: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex h-full min-h-[150px] flex-col justify-between gap-3 rounded-[32px] p-5',
        TONES[tone],
        className,
      )}
    >
      <span className="font-display text-[22px] font-extrabold leading-7">{title}</span>
      {children}
    </Link>
  )
}

const muted = (tone: Tone) => (tone === 'dark' ? 'text-[#c9e2bd]' : 'text-text-muted')

export function MorePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const plus = usePlus()
  const displayName = profile?.display_name ?? user?.email ?? ''
  const initial = initialOf(profile?.display_name, user?.email ?? '')
  const { has } = useEnabledFeatures()
  const [showMore, setShowMore] = useState(false)
  const [sentinel, scrolled] = useScrolledPast<HTMLDivElement>()
  const today = todayIso()

  const accounts = useAccounts()
  const savings = useSavings()
  const subscriptions = useSubscriptions()
  const categories = useCategories()
  const trips = useTrips()
  const ants = useAnts(today)

  const media = accounts.data ?? []
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
  const colors = (categories.data ?? []).slice(0, 5).map((c) => c.color)
  const trip = useMemo(() => nextTrip(trips.data ?? [], today), [trips.data, today])
  const tripLabel = trip ? tripLabelOf(trip, today) : null
  const antsTotal = ants.data?.monthTotalCents ?? 0

  const entries: Entry[] = [
    {
      key: 'medios',
      wide: true,
      node: (
        <MoreCard to="/cuentas" title="Medios de pago" tone="sage" className="min-h-[170px]">
          <span className="-mt-2 text-[17px] text-text-muted">
            Administrá tus cuentas y tarjetas
          </span>
          <span className="flex items-end justify-between gap-3">
            <span aria-hidden="true" className="flex min-w-0 overflow-hidden">
              {media.slice(0, 4).map((a, i) => {
                const skin = skinForAccountName(a.name)
                return (
                  <span
                    key={a.id}
                    className="-ml-3 h-8 w-12 shrink-0 rounded-[10px] ring-2 ring-[#dfe5cc] first:ml-0 dark:ring-sand"
                    style={{
                      background: skin
                        ? skinBackground(skin)
                        : (MEDIUM_TONES[i % MEDIUM_TONES.length] as string),
                    }}
                  />
                )
              })}
            </span>
            {media.length > 0 && (
              <span className="whitespace-nowrap font-display text-[22px] font-extrabold">
                {media.length} {media.length === 1 ? 'medio' : 'medios'}
              </span>
            )}
          </span>
        </MoreCard>
      ),
    },
    {
      key: 'metas',
      feature: 'savings',
      node: (
        <MoreCard to="/metas" title="Presupuestos y metas" tone="sage">
          {goalShare !== null ? (
            <span>
              <span className="block font-display text-[36px] font-extrabold leading-9">
                {goalShare}%
              </span>
              <span className="block text-[15px] leading-5 text-text-muted">
                <AmountDisplay cents={goalTotals.reservedCents} /> de{' '}
                <AmountDisplay cents={goalTotals.targetCents} />
              </span>
            </span>
          ) : (
            <span className="text-[15px] leading-5 text-text-muted">Límites y ahorro</span>
          )}
        </MoreCard>
      ),
    },
    {
      key: 'recurrentes',
      feature: 'recurring',
      node: (
        <MoreCard to="/recurrentes" title="Pagos recurrentes" tone="dark">
          {monthlySubs.length > 0 ? (
            <span>
              <AmountDisplay
                cents={monthlyTotal}
                className="block font-display text-[30px] font-extrabold leading-9"
              />
              <span className={cn('block text-[15px] leading-5', muted('dark'))}>
                por mes · {monthlySubs.length} {monthlySubs.length === 1 ? 'activa' : 'activas'}
              </span>
            </span>
          ) : (
            <span className={cn('text-[15px] leading-5', muted('dark'))}>
              Suscripciones y gastos fijos
            </span>
          )}
        </MoreCard>
      ),
    },
    {
      key: 'categorias',
      node: (
        <MoreCard to="/categorias" title="Categorías" tone="paper">
          <span>
            {colors.length > 0 && (
              <span aria-hidden="true" className="mb-3 flex gap-2">
                {colors.map((c, i) => (
                  <span
                    key={i}
                    className="size-[18px] rounded-full"
                    style={{ backgroundColor: themedColor(c) }}
                  />
                ))}
              </span>
            )}
            <span className="block text-[15px] leading-5 text-text-muted">
              Creá y editá las tuyas
            </span>
          </span>
        </MoreCard>
      ),
    },
    {
      key: 'viajes',
      feature: 'trips',
      node: (
        <MoreCard to="/viajes" title="Viajes" tone="sage">
          {trip && tripLabel ? (
            <span>
              <span className="line-clamp-2 break-words font-display text-[22px] font-extrabold leading-7">
                {trip.name}
              </span>
              <span className="block text-[15px] leading-5 text-text-muted">{tripLabel}</span>
            </span>
          ) : (
            <span className="text-[15px] leading-5 text-text-muted">Presupuesto y gastos</span>
          )}
        </MoreCard>
      ),
    },
    {
      key: 'hormigas',
      feature: 'ants',
      node: (
        <MoreCard to="/hormigas" title="Gastos hormiga" tone="moss">
          <span>
            {antsTotal > 0 ? (
              <>
                <AmountDisplay
                  cents={antsTotal}
                  className="block font-display text-[22px] font-extrabold leading-7"
                />
                <span className="block text-[15px] leading-5 text-text-muted">este mes</span>
              </>
            ) : (
              <>
                <span className="block font-display text-[22px] font-extrabold leading-7">
                  Sin hormigas
                </span>
                <span className="block text-[15px] leading-5 text-text-muted">
                  Esos gustitos que suman
                </span>
              </>
            )}
          </span>
        </MoreCard>
      ),
    },
    {
      key: 'informes',
      feature: 'reports',
      node: (
        <MoreCard to="/este-mes" title="Informes" tone="paper">
          <span>
            <span aria-hidden="true" className="mb-3 flex h-10 items-end gap-2">
              {[40, 70, 50, 100, 36].map((h, i) => (
                <span
                  key={i}
                  className={cn('w-4 rounded-full', i === 3 ? 'bg-[#a8cf9a]' : 'bg-forest')}
                  style={{ height: `${h}%` }}
                />
              ))}
            </span>
            <span className="block text-[15px] leading-5 text-text-muted">Tu mes y tu año</span>
          </span>
        </MoreCard>
      ),
    },
    ...(FEATURES.pro
      ? [
          {
            key: 'integraciones',
            node: (
              <PlainCard
                to="/pro"
                title="Integraciones"
                subtitle="Billeteras y bancos"
                icon={Plug}
              />
            ),
          },
        ]
      : []),
    ...(FEATURES.debts
      ? [
          {
            key: 'deudas',
            feature: 'debts' as AppFeature,
            node: (
              <PlainCard
                to="/deudas"
                title="Deudas"
                subtitle="Lo que debés y te deben"
                icon={HandCoins}
              />
            ),
          },
        ]
      : []),
    ...(FEATURES.aguinaldo
      ? [
          {
            key: 'aguinaldo',
            feature: 'aguinaldo' as AppFeature,
            node: <PlainCard to="/aguinaldo" title="Aguinaldo" subtitle="Repartilo" icon={Gift} />,
          },
        ]
      : []),
  ]
  const featured = entries.filter((e) => !e.feature || has(e.feature))
  const others = entries.filter((e) => e.feature && !has(e.feature))

  return (
    <section className="figma-scale pb-4">
      <CompactHeader title="Más" subtitle={formatMonthName(monthStart(today))} visible={scrolled} />
      <header className="px-5 pt-14">
        <p className="text-[20px] text-text-muted">Tu cuenta</p>
        <h1 className="font-display text-[48px] font-extrabold leading-tight">Más</h1>
      </header>
      <div ref={sentinel} aria-hidden="true" className="h-px" />

      <div className="mt-4 flex flex-col gap-3 px-5">
        <Link
          to="/perfil"
          aria-label="Ver mi perfil"
          className="flex items-center gap-4 rounded-[32px] bg-forest p-5 text-cream"
        >
          <PhotoOrInitial
            url={resolveAvatarUrl({ user, profileUrl: profile?.avatar_url })}
            initial={initial}
            alt="Tu foto de perfil"
            className="size-[72px] shrink-0"
            fallbackClassName="bg-[#f4f3e4] font-display text-3xl font-extrabold text-forest"
          />
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <p className="text-text-muted-on-dark">Cargando perfil…</p>
            ) : isError ? (
              <p className="text-blush">No pudimos cargar tu perfil.</p>
            ) : (
              <p className="truncate font-display text-[28px] font-extrabold leading-8">
                {displayName}
              </p>
            )}
            {!plus.isLoading &&
              (plus.isPlus ? (
                <PlusPill className="mt-1" />
              ) : (
                <span className="mt-1 inline-block rounded-full bg-white/10 px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#c9e2bd]">
                  Plan gratis
                </span>
              ))}
          </div>
          <ChevronRight aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
        </Link>

        {FEATURES.pro && (
          <Link to="/pro" className="flex items-center gap-4 rounded-[28px] bg-gold px-5 py-4">
            <ShoppingBasket aria-hidden="true" className="size-7" strokeWidth={2} />
            <span className="flex-1">
              <span className="block text-[20px] font-extrabold leading-6">Probá Moni Pro</span>
              <span className="block text-[15px]">Voz, tickets, bancos y más</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-6" />
          </Link>
        )}
        {FEATURES.referral && (
          <Link
            to="/recomendar"
            className="flex items-center gap-4 rounded-[28px] border border-lime bg-tint-green px-5 py-4"
          >
            <Gift aria-hidden="true" className="size-7" strokeWidth={2} />
            <span className="flex-1">
              <span className="block text-[20px] font-extrabold leading-6">Recomendá Moni</span>
              <span className="block text-[15px]">Los dos ganan 2 meses de Pro</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-6" />
          </Link>
        )}

        <CardGrid entries={featured} />

        {others.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showMore}
              aria-controls="mas-herramientas"
              onClick={() => setShowMore((v) => !v)}
              className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-line bg-card font-display text-[16px] font-extrabold text-ink"
            >
              Más herramientas
              <ChevronDown
                aria-hidden="true"
                className={cn('size-5 transition-transform', showMore && 'rotate-180')}
                strokeWidth={2.25}
              />
            </button>
            {showMore && (
              <div id="mas-herramientas">
                <p className="mb-3 px-1 text-center text-[14px] text-text-muted">
                  No las elegiste como objetivo, pero están acá cuando las necesites. Podés cambiar
                  tus objetivos desde Perfil.
                </p>
                <CardGrid entries={others} />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function CardGrid({ entries }: { entries: Entry[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {entries.map((e) => (
        <li key={e.key} className={e.wide ? 'col-span-2' : undefined}>
          {e.node}
        </li>
      ))}
    </ul>
  )
}

function PlainCard({
  to,
  title,
  subtitle,
  icon: Icon,
}: {
  to: string
  title: string
  subtitle: string
  icon: typeof Plug
}) {
  return (
    <MoreCard to={to} title={title} tone="paper">
      <span>
        <Icon
          aria-hidden="true"
          className="mb-2 size-7 text-forest dark:text-lime"
          strokeWidth={2}
        />
        <span className="block text-[15px] leading-5 text-text-muted">{subtitle}</span>
      </span>
    </MoreCard>
  )
}
