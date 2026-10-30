import { House, LayoutGrid, ReceiptText, UsersRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
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

function NavTab({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        cn(
          'flex size-11 items-center min-[380px]:size-12 justify-center rounded-full transition-colors',
          isActive ? 'bg-lime text-forest' : 'text-text-muted-on-dark hover:text-cream',
        )
      }
    >
      <Icon aria-hidden="true" className="size-6" strokeWidth={2} />
    </NavLink>
  )
}

/**
 * Bottom bar. The tabs split evenly around the `center` slot (the add button), which sits exactly in the middle of the bar:
 * both halves share the free space equally, whatever number of tabs each has.
 */
export function BottomNav({ center }: { center?: ReactNode }) {
  const { has } = useEnabledFeatures()
  const items = NAV_ITEMS.filter((item) => !item.feature || has(item.feature))
  const half = Math.ceil(items.length / 2)
  const left = center ? items.slice(0, half) : items
  const right = center ? items.slice(half) : []
  return (
    <nav
      aria-label="Navegación principal"
      className="pointer-events-auto relative grid h-16 grid-cols-[1fr_auto_1fr] items-center rounded-full bg-forest px-2 shadow-lg dark:ring-1 dark:ring-white/15"
    >
      <div className="flex items-center justify-around">
        {left.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
      </div>
      <div className="relative flex w-[76px] justify-center">{center}</div>
      <div className="flex items-center justify-around">
        {right.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
      </div>
    </nav>
  )
}
