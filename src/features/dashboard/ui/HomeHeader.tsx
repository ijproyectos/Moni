import { Link } from 'react-router'
import { formatLongDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'

interface HomeHeaderProps {
  initial: string
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Moni Plus is running right now (real subscription status): the avatar wears the PLUS badge. */
  isPlus?: boolean
  /** First name for the greeting; without it the title is just the greeting. */
  name?: string | null
  /** Right now (a prop so the greeting and the date can be tested). */
  now?: Date
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-mint-ink'

function greetingFor(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Buen día'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Greeting row of Hoy: avatar (opens the profile), greeting + date, and the pill with privacy and the bell. */
export function HomeHeader({
  initial,
  photoUrl = null,
  isPlus = false,
  name = null,
  now,
}: HomeHeaderProps) {
  const moment = now ?? new Date()
  const greeting = greetingFor(moment)
  const date = formatLongDay(todayIso()).replace(',', '')
  return (
    <header className="flex items-center justify-between gap-3 px-[18px] pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to="/perfil"
          aria-label={isPlus ? 'Perfil, Moni Plus activo' : 'Perfil'}
          className={`relative flex size-[54px] shrink-0 items-center justify-center rounded-full ${RING}`}
        >
          {isPlus && (
            <span
              data-plus-badge
              aria-hidden="true"
              className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-1.5 indent-[0.08em] text-[10px] font-extrabold leading-4 tracking-[0.08em] text-on-bright shadow-sm ring-2 ring-canvas"
            >
              ✦ PLUS
            </span>
          )}
          <PhotoOrInitial
            url={photoUrl}
            initial={initial}
            alt="Tu foto de perfil"
            className="size-[54px]"
            fallbackClassName="bg-[#0B3D2E] font-display text-[20px] font-extrabold text-[#F1EEDD]"
          />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#0B3D2E] dark:text-ink">
            {name ? `${greeting}, ${name}` : greeting}
          </h1>
          <p className="truncate text-[16px] font-medium text-[#566A5C] dark:text-text-muted">{date}</p>
        </div>
      </div>
    </header>
  )
}
