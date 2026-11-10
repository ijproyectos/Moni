import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useEnabledFeatures } from '@/features/onboarding/api/useGoals'
import { cn } from './cn'

interface NavItem {
  to: string
  label: string
  end?: boolean
  /** Tab shown only when the person's goals include it. */
  feature?: 'groups'
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/actividad', label: 'Actividad' },
  { to: '/grupos', label: 'Grupos', feature: 'groups' },
  { to: '/mas', label: 'Más' },
]

function NavTab({ to, label, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-full px-1.5 font-display text-[13px] font-bold transition-colors min-[340px]:px-2 min-[340px]:text-[14px] min-[380px]:px-3.5 min-[380px]:text-[16px]',
          isActive ? 'bg-ink text-cream dark:bg-lime dark:text-on-bright' : 'text-text-muted',
        )
      }
    >
      {label}
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
      className="pointer-events-auto relative grid h-[68px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-t border-line bg-card px-1"
    >
      <div className="flex min-w-0 items-center justify-around gap-0.5 min-[380px]:gap-1">
        {left.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
      </div>
      <div className="relative flex w-[60px] justify-center min-[340px]:w-[68px] min-[380px]:w-[76px]">
        {center}
      </div>
      <div className="flex min-w-0 items-center justify-around gap-0.5 min-[380px]:gap-1">
        {right.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
      </div>
    </nav>
  )
}
