import { useState } from 'react'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'

interface HomeHeaderProps {
  initial: string
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Moni Plus is running right now (real subscription status): a small gold crown worn on top of the avatar opens the plan's benefits (as the avatar does). */
  isPlus?: boolean
  /** First name for the greeting; without it the title is just "Hola". */
  name?: string | null
}

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] dark:focus-visible:outline-[#F1EEDD]'

/** A simple classic crown in Moni Plus gold: three points over a band. */
function GoldCrown() {
  return (
    <svg viewBox="0 0 26 18" aria-hidden="true" className="h-[18px] w-[26px] drop-shadow-[0_1px_1px_rgba(90,60,0,0.35)]">
      <path d="M2 14 L1 4.5 L8 9 L13 1.5 L18 9 L25 4.5 L24 14 Z" fill="#E3B23C" stroke="#B88A1E" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="2" y="14.4" width="22" height="2.6" rx="1.2" fill="#F0C75A" stroke="#B88A1E" strokeWidth="1.2" />
      <circle cx="13" cy="1.8" r="1.5" fill="#F7DC8B" stroke="#B88A1E" strokeWidth="0.9" />
    </svg>
  )
}

/** Greeting row of Inicio: "Hola, [nombre]" on one line and the avatar, which opens Moni Plus (plans and benefits), with the crown for Plus. */
export function HomeHeader({ initial, photoUrl = null, isPlus = false, name = null }: HomeHeaderProps) {
  const [plansOpen, setPlansOpen] = useState(false)
  return (
    <header className="flex items-center justify-between gap-3 px-[18px] pb-1 pt-4">
      <h1 className="min-w-0 truncate whitespace-nowrap font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#0C2418] dark:text-[#F1EEDD]">
        {name ? `Hola, ${name}` : 'Hola'}
      </h1>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPlansOpen(true)}
          aria-label="Ver Moni Plus"
          aria-haspopup="dialog"
          className={`block rounded-full ${RING}`}
        >
          <PhotoOrInitial
            url={photoUrl}
            initial={initial}
            alt="Tu foto de perfil"
            className="size-10 ring-2 ring-[#1B3A2E] dark:ring-[#A99BE3]"
            fallbackClassName="bg-[#1B3A2E] font-display text-[16px] font-extrabold text-[#F1EEDD]"
          />
        </button>
        {isPlus && (
          <button
            type="button"
            onClick={() => setPlansOpen(true)}
            aria-label="Moni Plus activo, ver beneficios"
            aria-haspopup="dialog"
            data-plus-crown
            className={`absolute -top-[13px] left-1/2 z-10 flex h-[18px] w-[26px] -translate-x-1/2 items-end justify-center rounded-sm before:absolute before:-inset-x-3 before:-inset-y-2 before:content-[''] ${RING}`}
          >
            <GoldCrown />
          </button>
        )}
      </div>
      {plansOpen && <PlusSheet onClose={() => setPlansOpen(false)} />}
    </header>
  )
}
