import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from './cn'
import { useMyInitial } from './myInitialContext'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

/** The tabs of the floating bar; the profile is the round avatar at the end. Grupos is always there. */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Hoy', end: true },
  { to: '/grupos', label: 'Grupos' },
  { to: '/mas', label: 'Herramientas' },
]

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-mint-ink'

function NavTab({ to, label, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-w-0 flex-auto items-center justify-center whitespace-nowrap rounded-full px-1.5 text-[clamp(12px,3.7vw,15px)] leading-none outline-none',
          RING,
          'motion-safe:transition motion-safe:active:scale-[0.97] active:brightness-95',
          isActive
            ? 'bg-[#0B3D2E] font-extrabold text-[#F1EEDD]'
            : 'font-bold text-[#566A5C] dark:text-text-muted',
        )
      }
    >
      <span>{label}</span>
    </NavLink>
  )
}

/**
 * Floating bottom bar in two pieces: a white pill with the four tabs and, apart on the right, the assistant slot
 * (`assistant`, the cat button that opens the add menu). Only the pill carries a shadow.
 */
export function BottomNav({ assistant }: { assistant?: ReactNode }) {
  const initial = useMyInitial()
  return (
    <div className="flex h-[60px] items-center gap-1.5 px-2.5 min-[380px]:gap-2 min-[380px]:px-3">
      <nav
        aria-label="Navegación principal"
        className="pointer-events-auto flex h-full min-w-0 flex-1 items-stretch gap-0.5 rounded-full border border-[#DCD8BF] bg-[#FAF8EC] p-1 shadow-[0_12px_36px_rgba(17,34,24,0.14)] dark:border-line dark:bg-card"
      >
        {NAV_ITEMS.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
        <NavLink
          to="/perfil"
          aria-label="Perfil"
          className={({ isActive }) =>
            cn(
              'flex size-11 shrink-0 items-center min-[380px]:size-[52px] justify-center rounded-full bg-[#0B3D2E] font-display text-[17px] font-extrabold text-[#F1EEDD] outline-none',
              RING,
              isActive && 'ring-2 ring-[#E3B23C]',
            )
          }
        >
          {initial}
        </NavLink>
      </nav>
      {assistant && (
        <div data-testid="assistant-slot" className="pointer-events-auto relative size-[60px] shrink-0">
          {assistant}
        </div>
      )}
    </div>
  )
}
