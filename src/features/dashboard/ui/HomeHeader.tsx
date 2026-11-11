import { Bell, Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router'
import { useNotifications } from '@/features/notifications/mock/notificationsStore'
import { FEATURES } from '@/shared/config/features'
import { formatLongDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'

interface HomeHeaderProps {
  initial: string
  /** Reminders (e.g. tomorrow's charges) that add to the bell's count. */
  reminderCount?: number
  /** Unread notices of groups (reminders and payments to confirm): they count on the bell. */
  noticeCount?: number
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Moni Plus is running right now (real subscription status): the avatar wears the PLUS badge. */
  isPlus?: boolean
  /** First name for the greeting; without it the title is just the greeting. */
  name?: string | null
  /** Right now (a prop so the greeting and the date can be tested). */
  now?: Date
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

function greetingFor(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Buen día'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Greeting row of Hoy: avatar (opens the profile), greeting + date, and the pill with privacy and the bell. */
export function HomeHeader({
  initial,
  reminderCount = 0,
  noticeCount = 0,
  photoUrl = null,
  isPlus = false,
  name = null,
  now,
}: HomeHeaderProps) {
  const { unread: unreadNotices } = useNotifications()
  const { hidden, toggle } = useHiddenAmounts()
  const unread = FEATURES.notifications ? unreadNotices + reminderCount + noticeCount : noticeCount
  const moment = now ?? new Date()
  const greeting = greetingFor(moment)
  const date = formatLongDay(todayIso()).replace(',', '')
  const PrivacyIcon = hidden ? EyeOff : Eye
  return (
    <header className="flex items-center justify-between gap-3 px-[18px] pb-1 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to="/perfil"
          aria-label={isPlus ? 'Perfil, Moni Plus activo' : 'Perfil'}
          className={`relative flex size-11 shrink-0 items-center justify-center rounded-full ${RING}`}
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
            className="size-11"
            fallbackClassName="bg-mint-soft font-display text-[16px] font-semibold text-mint-ink"
          />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {name ? `${greeting}, ${name}` : greeting}
          </h1>
          <p className="truncate text-[13px] text-text-muted">{date}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-card p-1">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
          className={`flex size-[38px] items-center justify-center rounded-full text-ink ${RING}`}
        >
          <PrivacyIcon aria-hidden="true" className="size-5" strokeWidth={1.9} />
        </button>
        <Link
          to={FEATURES.notifications ? '/avisos' : '/grupos/avisos'}
          aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
          className={`relative flex size-[38px] items-center justify-center rounded-full text-ink ${RING}`}
        >
          <Bell aria-hidden="true" className="size-5" strokeWidth={1.9} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-expense text-[12px] font-extrabold text-white">
              {unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
