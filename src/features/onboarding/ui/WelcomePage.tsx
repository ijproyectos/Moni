import { useState } from 'react'
import mascotUrl from '@/assets/mascot/personaje_asistente.svg'
import { signInWithApple, signInWithGoogle } from '@/features/auth/api/authActions'
import { clearSuspendedNotice, readSuspendedNotice } from '@/features/auth/domain/suspendedNotice'
import { SUSPENDED_MESSAGE } from '@/features/support/domain/support'
import { MessageCircle, Sun, UsersRound } from 'lucide-react'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { APPLE_PILL, MINT_PILL } from '@/shared/ui/mentaStyles'

/** Logo de Apple (glyph oficial, trazo simple) para el botón "Continuar con Apple". */
function AppleGlyph() {
  return (
    <svg viewBox="0 0 170 170" aria-hidden="true" className="size-[18px] fill-current">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.345-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.863-1.416 13.526-4.239 7.248-2.618 13.372-3.702 18.408-3.275 13.598 1.098 23.828 6.464 30.653 16.133-12.164 7.37-18.182 17.689-18.064 30.918.107 10.309 3.861 18.886 11.242 25.692 3.355 3.186 7.097 5.649 11.246 7.401-.901 2.619-1.853 5.124-2.862 7.53zM119.11 7.24c0 8.102-2.962 15.655-8.861 22.634-7.12 8.299-15.723 13.096-25.045 12.35a25.32 25.32 0 0 1-.189-3.07c0-7.772 3.388-16.083 9.408-22.867 3.005-3.44 6.828-6.299 11.47-8.59C110.531 5.43 114.916 4.17 119.034 4c.115 1.088.168 2.17.16 3.24z" />
    </svg>
  )
}

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

  async function handleAppleSignIn() {
    clearSuspendedNotice()
    setSuspended(false)
    setError(null)
    setIsRedirecting(true)
    try {
      await signInWithApple()
    } catch {
      setIsRedirecting(false)
      setError('No pudimos conectarte con Apple. Probá de nuevo.')
    }
  }

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-[18px] pb-[max(env(safe-area-inset-bottom),20px)]">
        <header className="-mx-[18px] flex flex-col items-center gap-4 rounded-b-[40px] bg-mint px-6 pb-8 pt-[max(env(safe-area-inset-top),30px)] text-white">
          <img
            src={mascotUrl}
            alt="Moni"
            className="size-[132px] rounded-full max-[380px]:size-[104px] border-[5px] border-lilac bg-card object-contain p-2"
          />
          <h1 className="text-balance text-center font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">
            Hola, soy Moni
          </h1>
          <p className="max-w-[290px] text-pretty text-center text-[16px] text-[#DDF3E6]">
            Te digo cuánto podés gastar hoy y te ayudo a decidir qué hacer con tu plata.
          </p>
        </header>

        <ul className="flex flex-col gap-4 px-1 pb-2 pt-1">
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


        <button
          type="button"
          onClick={handleSignIn}
          disabled={isRedirecting}
          className={cn(MINT_PILL, 'mt-auto h-[54px] shrink-0 text-[16px] font-bold')}
        >
          Empezar
        </button>
        <button
          type="button"
          onClick={handleAppleSignIn}
          disabled={isRedirecting}
          className={cn(APPLE_PILL, 'h-[54px] shrink-0 text-[16px] font-bold')}
        >
          <AppleGlyph />
          Continuar con Apple
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
