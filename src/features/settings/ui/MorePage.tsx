import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  Gift,
  HandCoins,
  Plug,
  RefreshCw,
  Send,
  Shapes,
  ShoppingBasket,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { resolveAvatarUrl } from '@/features/auth/domain/avatar'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import { usePlus } from '@/features/plus/api/usePlus'
import type { AppFeature } from '@/features/onboarding/domain/goals'
import { FEATURES, type FeatureFlag } from '@/shared/config/features'
import { cn } from '@/shared/ui/cn'
import { AntIcon } from '@/shared/ui/AntIcon'

interface Tile {
  to: string
  title: string
  subtitle: string
  icon: LucideIcon
  bg: string
  color?: string
  /** Shown up front only when the person's goals include it; otherwise under "Más herramientas". */
  feature?: AppFeature
  /** Hidden while this flag is off (screen without a real backend). */
  flag?: FeatureFlag
}

// Screen 018 — Más.
const TILES: Tile[] = [
  {
    to: '/pro',
    flag: 'pro',
    title: 'Integraciones',
    subtitle: 'Billeteras y bancos',
    icon: Plug,
    bg: '#fdeab8',
    color: '#8a5a00',
  },
  {
    to: '/cuentas',
    title: 'Medios de pago',
    subtitle: 'Administrá tus cuentas y tarjetas',
    icon: CreditCard,
    bg: '#e3f2cf',
  },
  {
    to: '/metas',
    feature: 'savings',
    title: 'Presupuestos y metas',
    subtitle: 'Límites y ahorro',
    icon: Target,
    bg: '#e3f2cf',
  },
  {
    to: '/recurrentes',
    feature: 'recurring',
    title: 'Pagos recurrentes',
    subtitle: 'Suscripciones y gastos fijos',
    icon: RefreshCw,
    bg: '#e3f2cf',
  },
  {
    to: '/categorias',
    title: 'Categorías',
    subtitle: 'Creá y editá las tuyas',
    icon: Shapes,
    bg: '#e3f2cf',
  },
  {
    to: '/viajes',
    feature: 'trips',
    title: 'Viajes',
    subtitle: 'Presupuesto y gastos',
    icon: Send,
    bg: '#d9ebe4',
    color: '#2f7d6f',
  },
  {
    to: '/deudas',
    flag: 'debts',
    feature: 'debts',
    title: 'Deudas',
    subtitle: 'Lo que debés y te deben',
    icon: HandCoins,
    bg: '#fbdcd7',
    color: '#b8321f',
  },
  {
    to: '/aguinaldo',
    flag: 'aguinaldo',
    feature: 'aguinaldo',
    title: 'Aguinaldo',
    subtitle: 'Repartilo',
    icon: Gift,
    bg: '#e3f2cf',
  },
  {
    to: '/hormigas',
    feature: 'ants',
    title: 'Gastos hormiga',
    subtitle: 'Esos gustitos que suman',
    icon: AntIcon,
    bg: '#fdeab8',
    color: '#064735',
  },
  {
    to: '/este-mes',
    feature: 'reports',
    title: 'Informes',
    subtitle: 'Tu mes y tu año',
    icon: ShoppingBasket,
    bg: '#e3f2cf',
  },
]

export function MorePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const plus = usePlus()
  const displayName = profile?.display_name ?? user?.email ?? ''
  const initial = initialOf(profile?.display_name, user?.email ?? '')
  const { has } = useEnabledFeatures()
  const [showMore, setShowMore] = useState(false)
  const tiles = TILES.filter((t) => !t.flag || FEATURES[t.flag])
  const featured = tiles.filter((t) => !t.feature || has(t.feature))
  const others = tiles.filter((t) => t.feature && !has(t.feature))

  return (
    <section className="flex flex-col gap-3 px-4 pt-14">
      <h1 className="sr-only">Más</h1>
      <Link
        to="/perfil"
        aria-label="Ver mi perfil"
        className="flex items-center gap-4 rounded-[28px] bg-forest p-4 text-cream"
      >
        <PhotoOrInitial
          url={resolveAvatarUrl({ user, profileUrl: profile?.avatar_url })}
          initial={initial}
          alt="Tu foto de perfil"
          className="size-[72px] shrink-0"
          fallbackClassName="bg-lime font-display text-3xl font-extrabold text-forest"
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
          {!plus.isLoading && (
            <span className="mt-1 inline-block rounded-full bg-surface px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              {plus.isPlus ? 'Moni Plus' : 'Plan gratis'}
            </span>
          )}
        </div>
        <ChevronRight aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
      </Link>

      {FEATURES.pro && (
        <Link to="/pro" className="flex items-center gap-4 rounded-[22px] bg-gold px-4 py-3">
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
          className="flex items-center gap-4 rounded-[22px] border border-lime bg-lime/30 px-4 py-3"
        >
          <Gift aria-hidden="true" className="size-7" strokeWidth={2} />
          <span className="flex-1">
            <span className="block text-[20px] font-extrabold leading-6">Recomendá Moni</span>
            <span className="block text-[15px]">Los dos ganan 2 meses de Pro</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-6" />
        </Link>
      )}

      <TileGrid tiles={featured} />

      {others.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showMore}
            aria-controls="mas-herramientas"
            onClick={() => setShowMore((v) => !v)}
            className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-card font-display text-[16px] font-extrabold text-ink"
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
              <TileGrid tiles={others} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {tiles.map(({ to, title, subtitle, icon: Icon, bg, color }) => (
        <li key={title}>
          <Link
            to={to}
            className="flex h-full min-h-[172px] flex-col items-center justify-center gap-2 rounded-[24px] border border-sand bg-card p-4 text-center"
          >
            <span
              aria-hidden="true"
              className="flex size-[60px] items-center justify-center rounded-[18px]"
              style={{ backgroundColor: bg, color: color ?? '#064735' }}
            >
              <Icon className="size-7" strokeWidth={2} />
            </span>
            <span className="text-[19px] font-extrabold leading-6">{title}</span>
            <span className="text-[15px] leading-5 text-text-muted">{subtitle}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
