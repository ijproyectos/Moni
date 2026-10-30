import { House, LayoutGrid, ReceiptText, UsersRound, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import { cn } from './cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Tab shown only when the person's goals include it. */
  feature?: 'groups'
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/actividad', label: 'Actividad', icon: ReceiptText },
  { to: '/grupos', label: 'Grupos', icon: UsersRound, feature: 'groups' },
  { to: '/mas', label: 'Más', icon: LayoutGrid },
]

export function BottomNav() {
  const { has } = useEnabledFeatures()
  const items = NAV_ITEMS.filter((item) => !item.feature || has(item.feature))
  return (
    <nav
      aria-label="Navegación principal"
      className="flex min-h-16 items-center gap-1 rounded-full bg-forest p-2 shadow-lg dark:ring-1 dark:ring-white/15"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              'flex h-12 min-w-12 items-center justify-center gap-2 rounded-full font-display text-[17px] font-extrabold transition-all',
              isActive
                ? 'bg-lime px-5 text-forest'
                : 'px-3 text-text-muted-on-dark hover:text-cream',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon aria-hidden="true" className="size-6" strokeWidth={2} />
              {isActive && <span>{label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
