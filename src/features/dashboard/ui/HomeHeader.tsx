import { useState } from 'react'
import { Link } from 'react-router'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'

interface HomeHeaderProps {
  initial: string
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Moni Plus is running right now (real subscription status): the avatar wears the PLUS badge, which opens the plans. */
  isPlus?: boolean
  /** First name for the greeting; without it the title is just the greeting. */
  name?: string | null
  /** Right now (a prop so the greeting can be tested). */
  now?: Date
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-[#F1EEDD]'

function greetingFor(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Buen día'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Greeting row of Inicio: small greeting and the name big, and at the right the avatar (with PLUS, which opens the plans). */
export function HomeHeader({ initial, photoUrl = null, isPlus = false, name = null, now }: HomeHeaderProps) {
  const [plansOpen, setPlansOpen] = useState(false)
  const greeting = greetingFor(now ?? new Date())
  const avatar = (
    <PhotoOrInitial
      url={photoUrl}
      initial={initial}
      alt="Tu foto de perfil"
      className="size-11 ring-2 ring-[#1B3A2E] dark:ring-[#A99BE3]"
      fallbackClassName="bg-[#1B3A2E] font-display text-[17px] font-extrabold text-[#F1EEDD]"
    />
  )
  return (
    <header className="flex items-start justify-between gap-3 px-[18px] pb-1 pt-5">
      <div className="min-w-0 pt-2">
        <p className="truncate text-[15px] font-semibold text-[#566A5C] dark:text-text-muted">
          {name ? greeting : ' '}
        </p>
        <h1 className="truncate font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-[#0C2418] dark:text-[#F1EEDD]">
          {name ?? greeting}
        </h1>
      </div>
      {isPlus ? (
        <button
          type="button"
          onClick={() => setPlansOpen(true)}
          aria-label="Moni Plus activo, ver planes y beneficios"
          aria-haspopup="dialog"
          className={`flex shrink-0 flex-col items-center gap-1 rounded-full ${RING}`}
        >
          <span
            data-plus-badge
            className="rounded-full border border-[#B88A1E] px-2.5 text-[11px] font-extrabold leading-5 tracking-[0.1em] text-[#B88A1E] dark:border-[#E3B23C] dark:text-[#E3B23C]"
          >
            PLUS
          </span>
          {avatar}
        </button>
      ) : (
        <Link to="/perfil" aria-label="Perfil" className={`mt-5 shrink-0 rounded-full ${RING}`}>
          {avatar}
        </Link>
      )}
      {plansOpen && <PlusSheet onClose={() => setPlansOpen(false)} />}
    </header>
  )
}
