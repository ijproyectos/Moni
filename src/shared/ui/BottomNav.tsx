import { House, LayoutGrid, ReceiptText, UsersRound, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from './cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/actividad', label: 'Actividad', icon: ReceiptText },
  { to: '/grupos', label: 'Grupos', icon: UsersRound },
  { to: '/mas', label: 'Más', icon: LayoutGrid },
]

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="flex h-16 flex-1 items-center justify-between rounded-full bg-forest p-2 shadow-lg"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              'flex h-12 min-w-11 items-center justify-center gap-2 rounded-full font-display text-base font-semibold transition-all',
              isActive
                ? 'bg-lime px-4 text-forest'
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
