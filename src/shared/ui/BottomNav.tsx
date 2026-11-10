import { ArrowLeftRight, House, User, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from './cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

/** The four tabs of the floating bar. Grupos is always there: it no longer depends on the person's goals. */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Hoy', icon: House, end: true },
  { to: '/actividad', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/grupos', label: 'Grupos', icon: Users },
  { to: '/perfil', label: 'Perfil', icon: User },
]

function NavTab({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full text-[10.5px] leading-none outline-none',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink',
          'motion-safe:transition motion-safe:active:scale-[0.97] active:brightness-95',
          isActive ? 'bg-mint-soft font-bold text-mint-ink' : 'font-semibold text-text-muted',
        )
      }
    >
      <Icon aria-hidden="true" className="size-[21px]" strokeWidth={2.1} />
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
  )
}

/**
 * Floating bottom bar in two pieces: a white pill with the four tabs and, apart on the right, the assistant slot
 * (`assistant`, the cat button that opens the add menu). Only the pill carries a shadow.
 */
export function BottomNav({ assistant }: { assistant?: ReactNode }) {
  return (
    <div className="flex h-[74px] items-center gap-2 px-3">
      <nav
        aria-label="Navegación principal"
        className="pointer-events-auto flex h-full min-w-0 flex-1 items-stretch gap-0.5 rounded-full bg-card p-1.5 shadow-[0_12px_36px_rgba(17,34,24,0.14)]"
      >
        {NAV_ITEMS.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
      </nav>
      {assistant && <div className="relative size-[74px] shrink-0">{assistant}</div>}
    </div>
  )
}
