import {
  ChevronRight,
  CreditCard,
  Gift,
  HandCoins,
  Plug,
  RefreshCw,
  Send,
  Shapes,
  ShoppingBag,
  ShoppingBasket,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'

interface Tile {
  to: string
  title: string
  subtitle: string
  icon: LucideIcon
  bg: string
  color?: string
}

// Screen 018 — Más.
const TILES: Tile[] = [
  {
    to: '/pro',
    title: 'Integraciones',
    subtitle: 'Billeteras y bancos',
    icon: Plug,
    bg: '#fdeab8',
    color: '#8a5a00',
  },
  {
    to: '/cuentas',
    title: 'Medios de pago',
    subtitle: 'Tarjetas, alias y efectivo',
    icon: CreditCard,
    bg: '#e3f2cf',
  },
  {
    to: '/metas',
    title: 'Presupuestos y metas',
    subtitle: 'Límites y ahorro',
    icon: Target,
    bg: '#e3f2cf',
  },
  {
    to: '/fijos',
    title: 'Fijos y cuotas',
    subtitle: 'Suscripciones y cuotas',
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
    title: 'Viajes',
    subtitle: 'Presupuesto y gastos',
    icon: Send,
    bg: '#d9ebe4',
    color: '#2f7d6f',
  },
  {
    to: '/deudas',
    title: 'Deudas',
    subtitle: 'Lo que debés y te deben',
    icon: HandCoins,
    bg: '#fbdcd7',
    color: '#b8321f',
  },
  { to: '/aguinaldo', title: 'Aguinaldo', subtitle: 'Repartilo', icon: Gift, bg: '#e3f2cf' },
  {
    to: '/hormigas',
    title: 'Gastos hormiga',
    subtitle: 'Lo chico que se repite',
    icon: ShoppingBag,
    bg: '#fdeab8',
    color: '#8a5a00',
  },
  {
    to: '/este-mes',
    title: 'Informes',
    subtitle: 'Tu mes y tu año',
    icon: ShoppingBasket,
    bg: '#e3f2cf',
  },
]

export function MorePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const displayName = profile?.display_name ?? user?.email ?? ''
  const initial = initialOf(profile?.display_name, user?.email ?? '')

  return (
    <section className="flex flex-col gap-3 px-4 pt-14">
      <h1 className="sr-only">Más</h1>
      <Link
        to="/perfil"
        aria-label="Ver mi perfil"
        className="flex items-center gap-4 rounded-[28px] bg-forest p-4 text-cream"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            referrerPolicy="no-referrer"
            className="size-[72px] rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-[72px] items-center justify-center rounded-full bg-lime font-display text-3xl font-extrabold text-forest"
          >
            {initial}
          </span>
        )}
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
          <span className="mt-1 inline-block rounded-full bg-surface px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
            Plan gratis
          </span>
        </div>
        <ChevronRight aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
      </Link>

      <Link to="/pro" className="flex items-center gap-4 rounded-[22px] bg-gold px-4 py-3">
        <ShoppingBasket aria-hidden="true" className="size-7" strokeWidth={2} />
        <span className="flex-1">
          <span className="block text-[20px] font-extrabold leading-6">Probá Moni Pro</span>
          <span className="block text-[15px]">Voz, tickets, bancos y más</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-6" />
      </Link>
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

      <ul className="grid grid-cols-2 gap-3">
        {TILES.map(({ to, title, subtitle, icon: Icon, bg, color }) => (
          <li key={title}>
            <Link
              to={to}
              className="flex h-full min-h-[172px] flex-col items-center justify-center gap-2 rounded-[24px] border border-sand bg-white p-4 text-center"
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
    </section>
  )
}
