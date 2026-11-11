import { useState } from 'react'
import mascotUrl from '@/assets/mascot/personaje_asistente.svg'
import { signInWithGoogle } from '@/features/auth/api/authActions'
import { clearSuspendedNotice, readSuspendedNotice } from '@/features/auth/domain/suspendedNotice'
import { SUSPENDED_MESSAGE } from '@/features/support/domain/support'
import { MessageCircle, Sun, UsersRound } from 'lucide-react'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MINT_PILL } from '@/shared/ui/mentaStyles'

const BENEFITS = [
  { icon: Sun, title: 'Tu disponible del día', text: 'Un número claro, todos los días.', tile: 'bg-ok-bg text-ok-ink' },
  { icon: MessageCircle, title: '¿Me conviene?', text: 'Preguntame antes de comprar o elegir cuotas.', tile: 'bg-lilac-soft text-[#4A3F96]' },
  { icon: UsersRound, title: 'Gastos compartidos', text: 'Dividí con tu pareja, familia o amigos.', tile: 'bg-[#FFF0B8] text-[#5A4300]' },
]

// Screen 016 — Bienvenida (Menta).
export function WelcomePage() {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suspended, setSuspended] = useState(readSuspendedNotice)

  async function handleSignIn() {
    clearSuspendedNotice()
    setSuspended(false)
    setError(null)
    setIsRedirecting(true)
    try {
      await signInWithGoogle()
    } catch {
      setIsRedirecting(false)
      setError('No pudimos conectarte con Google. Probá de nuevo.')
    }
  }

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-3 px-[18px] pb-[max(env(safe-area-inset-bottom),24px)]">
        <header className="-mx-[18px] flex flex-col items-center gap-4 rounded-b-[40px] bg-mint px-6 pb-[34px] pt-[30px] text-white">
          <img
            src={mascotUrl}
            alt="Moni"
            className="size-[132px] rounded-full border-[5px] border-lilac bg-card object-cover"
          />
          <h1 className="text-balance text-center font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">
            Hola, soy Moni
          </h1>
          <p className="max-w-[290px] text-pretty text-center text-[16px] text-[#DDF3E6]">
            Te digo cuánto podés gastar hoy y te ayudo a decidir qué hacer con tu plata.
          </p>
        </header>

        <ul className="flex flex-col gap-3.5 px-1 pt-2.5">
          {BENEFITS.map(({ icon: Icon, title, text, tile }) => (
            <li key={title} className="grid grid-cols-[44px_1fr] items-center gap-3.5">
              <span
                aria-hidden="true"
                className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] ${tile}`}
              >
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-[16px] font-bold">{title}</p>
                <p className="text-[13.5px] text-text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div aria-hidden="true" className="mt-auto flex justify-center gap-1.5 pt-3">
          <span className="h-[7px] w-[22px] rounded-full bg-mint" />
          <span className="size-[7px] rounded-full bg-[#C7D6CB]" />
          <span className="size-[7px] rounded-full bg-[#C7D6CB]" />
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={isRedirecting}
          className={cn(MINT_PILL, 'h-[54px] shrink-0 text-[16px] font-bold')}
        >
          Empezar
        </button>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={isRedirecting}
          className={cn(
            'min-h-11 rounded-full text-center text-[14.5px] font-semibold text-mint-ink disabled:opacity-60',
            FOCUS_RING,
          )}
        >
          Ya tengo cuenta
        </button>
        {suspended && (
          <p role="alert" className="text-center text-sm text-expense">
            {SUSPENDED_MESSAGE}
          </p>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
