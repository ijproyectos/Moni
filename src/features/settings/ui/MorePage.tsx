import { ChevronRight, CreditCard, Shapes, UsersRound, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { initialOf } from '@/features/auth/domain/profile'
import { useCategories } from '@/features/categories/api/useCategories'

interface Tile {
  to: string
  title: string
  subtitle: string
  icon: LucideIcon
  count?: number
}

export function MorePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const accounts = useAccounts()
  const categories = useCategories()

  const displayName = profile?.display_name ?? user?.email ?? ''
  const initial = initialOf(profile?.display_name, user?.email ?? '')

  const tiles: Tile[] = [
    {
      to: '/cuentas',
      title: 'Medios de pago',
      subtitle: 'Cuentas y efectivo',
      icon: CreditCard,
      count: accounts.data?.length,
    },
    {
      to: '/categorias',
      title: 'Categorías',
      subtitle: 'Creá y editá las tuyas',
      icon: Shapes,
      count: categories.data?.length,
    },
    { to: '/grupos', title: 'Grupos', subtitle: 'Gastos compartidos', icon: UsersRound },
  ]

  return (
    <section className="flex flex-col gap-4 px-4 pt-12">
      <h1 className="sr-only">Más</h1>
      <Link
        to="/perfil"
        aria-label="Ver mi perfil"
        className="flex items-center gap-4 rounded-xl bg-forest p-5 text-cream"
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
            className="flex size-[72px] items-center justify-center rounded-full bg-lime font-display text-3xl font-semibold text-forest"
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
            <p className="truncate font-display text-2xl font-semibold">{displayName}</p>
          )}
        </div>
        <ChevronRight aria-hidden="true" className="size-6 shrink-0" strokeWidth={2} />
      </Link>

      <ul className="grid grid-cols-2 gap-3">
        {tiles.map(({ to, title, subtitle, icon: Icon, count }) => (
          <li key={to}>
            <Link
              to={to}
              className="relative flex h-full min-h-[190px] flex-col items-center justify-center gap-2 rounded-xl border border-cream bg-white p-4 text-center"
            >
              {count !== undefined && (
                <span
                  aria-label={`${count} en total`}
                  className="absolute right-4 top-3 text-[15px] text-text-muted"
                >
                  {count}
                </span>
              )}
              <span
                aria-hidden="true"
                className="flex size-[68px] items-center justify-center rounded-lg bg-lime/50 text-forest"
              >
                <Icon className="size-7" strokeWidth={2} />
              </span>
              <span className="font-display text-xl font-semibold leading-6">{title}</span>
              <span className="text-[15px] leading-5 text-text-muted">{subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
