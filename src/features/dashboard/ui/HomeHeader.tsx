import { Bell } from 'lucide-react'
import { Link } from 'react-router'
import { useNotifications } from '@/features/notifications/mock/notificationsStore'
import { FEATURES } from '@/shared/config/features'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'

interface HomeHeaderProps {
  initial: string
  /** Reminders (e.g. tomorrow's charges) that add to the bell's count. */
  reminderCount?: number
  /** Unread notices of groups (reminders and payments to confirm): they show the bell even while the old Avisos screen is off. */
  noticeCount?: number
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Moni Plus is running right now (real subscription status): the avatar wears the PLUS badge. */
  isPlus?: boolean
  /** First name for the greeting; without it the title is just "Hola". */
  name?: string | null
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

/** Greeting row of Hoy: hello, the bell (notices) and the avatar that opens the profile. */
export function HomeHeader({
  initial,
  reminderCount = 0,
  noticeCount = 0,
  photoUrl = null,
  isPlus = false,
  name = null,
}: HomeHeaderProps) {
  const { unread: unreadNotices } = useNotifications()
  const unread = FEATURES.notifications ? unreadNotices + reminderCount + noticeCount : noticeCount
  const showBell = FEATURES.notifications || noticeCount > 0
  return (
    <header className="flex items-center justify-between gap-3 px-[18px] pb-1 pt-5">
      <h1 className="min-w-0 truncate font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        {name ? `Hola, ${name}` : 'Hola'}
      </h1>
      <div className="flex items-center gap-1.5">
        {showBell && (
          <Link
            to={FEATURES.notifications ? '/avisos' : '/grupos/avisos'}
            aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
            className={`relative flex size-11 items-center justify-center rounded-full bg-card text-ink ${RING}`}
          >
            <Bell aria-hidden="true" className="size-5" strokeWidth={2} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-expense text-[12px] font-extrabold text-white">
                {unread}
              </span>
            )}
          </Link>
        )}
        <Link
          to="/perfil"
          aria-label={isPlus ? 'Perfil, Moni Plus activo' : 'Perfil'}
          className={`relative flex size-11 items-center justify-center rounded-full ${RING}`}
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
            fallbackClassName="bg-lime font-display text-lg font-extrabold text-on-bright"
          />
        </Link>
      </div>
    </header>
  )
}
