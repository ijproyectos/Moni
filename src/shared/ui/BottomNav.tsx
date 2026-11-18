import { House } from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from './cn'
import { useMyInitial } from './myInitialContext'

interface NavItem {
  to: string
  /** Where the tab counts as active (defaults to `to`). */
  match?: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  end?: boolean
}

/** Two-tone filled icons of the design: the main shape in the current color, the second one softened. */
const SOFT = 'opacity-45'

function GroupsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="1.5 1.5 21 21" aria-hidden="true" className={className} fill="currentColor">
      <circle cx="14.5" cy="12" r="5.5" className={SOFT} />
      <circle cx="9.5" cy="12" r="5.5" />
    </svg>
  )
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="1.5 1.5 21 21" aria-hidden="true" className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="3.5" fill="currentColor" />
      <rect x="3" y="9.6" width="18" height="2" fill="var(--nav-icon-cut, #FAF8EC)" />
    </svg>
  )
}

function ToolsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="1.5 1.5 21 21" aria-hidden="true" className={className} fill="currentColor">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2.4" />
      <circle cx="16.5" cy="7.25" r="3.75" className={SOFT} />
      <circle cx="7.25" cy="16.75" r="3.75" className={SOFT} />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2.4" />
    </svg>
  )
}

/** The tabs of the floating bar; the profile is the round avatar at the end. Tarjetas opens Medios de pago. */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/grupos', label: 'Grupos', icon: GroupsIcon },
  { to: '/cuentas', match: '/cuentas', label: 'Tarjetas', icon: CardIcon },
  { to: '/mas', label: 'Herramientas', icon: ToolsIcon },
]

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-mint-ink'

function NavTab({ to, match, label, icon: Icon, end }: NavItem) {
  const { pathname } = useLocation()
  const isActive = end ? pathname === (match ?? to) : pathname.startsWith(match ?? to)
  return (
    <NavLink
      to={to}
      aria-label={label}
      title={label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-full items-center justify-center gap-2 rounded-full outline-none',
        RING,
        'motion-safe:transition motion-safe:active:scale-[0.97] active:brightness-95',
        isActive
          ? 'min-w-0 flex-[3.4] bg-[#1B3A2E] px-2.5 text-[#F1EEDD] [--nav-icon-cut:#1B3A2E] dark:bg-[#F1EEDD] dark:text-[#0E1A13] dark:[--nav-icon-cut:#F1EEDD]'
          : 'flex-1 text-[#1B3A2E] [--nav-icon-cut:#FAF8EC] dark:text-[#CFE0D5] dark:[--nav-icon-cut:#16261C]',
      )}
    >
      <Icon aria-hidden="true" className="size-[22px] shrink-0" strokeWidth={isActive ? 2.3 : 1.9} />
      {isActive && <span className="truncate text-[14px] font-extrabold">{label}</span>}
    </NavLink>
  )
}

/** Floating bottom bar: one pill with the four tabs (the active one shows its name) and the profile avatar. */
export function BottomNav() {
  const initial = useMyInitial()
  return (
    <div className="flex h-[60px] items-center px-3">
      <nav
        aria-label="Navegación principal"
        className="pointer-events-auto flex h-full min-w-0 flex-1 items-stretch gap-1 rounded-full border border-[#DCD8BF] bg-[#FAF8EC] p-1.5 shadow-[0_12px_36px_rgba(17,34,24,0.14)] dark:border-line dark:bg-[#16261C]"
      >
        {NAV_ITEMS.map((item) => (
          <NavTab key={item.to} {...item} />
        ))}
        <NavLink
          to="/perfil"
          aria-label="Perfil"
          className={({ isActive }) =>
            cn(
              'flex aspect-square h-full shrink-0 items-center justify-center rounded-full bg-[#1B3A2E] font-display text-[17px] font-extrabold text-[#F1EEDD] outline-none dark:bg-[#2B4A3C]',
              RING,
              isActive && 'ring-2 ring-[#E3B23C]',
            )
          }
        >
          {initial}
        </NavLink>
      </nav>
    </div>
  )
}
