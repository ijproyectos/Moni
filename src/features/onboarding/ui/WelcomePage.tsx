import { useState } from 'react'
import mascotUrl from '@/assets/mascot/personaje_asistente.svg'
import logoUrl from '@/assets/brand/logo_moni_lima.svg'
import { signInWithGoogle } from '@/features/auth/api/authActions'
import { Button } from '@/shared/ui/Button'
import { Coin } from '@/shared/ui/Coin'

// Screen 01 — Bienvenida. Measurements follow the 390×844 design export.
export function WelcomePage() {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
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
    <main className="min-h-dvh bg-forest text-cream">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[390px] flex-col px-6 pb-[max(env(safe-area-inset-bottom),38px)]">
        <img src={logoUrl} alt="moni" className="mx-auto mt-[65px] h-[52px] w-auto" />

        <div className="relative mx-auto mt-[57px] size-[314px]">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-[38px] size-[258px] -translate-x-1/2 rounded-full bg-surface"
          />
          <img src={mascotUrl} alt="" className="relative size-full" />
        </div>

        <Coin className="absolute left-[298px] top-[161px] size-10" />
        <Coin className="absolute left-[39px] top-[204px] size-7" />
        <Coin variant="hole" className="absolute left-[337px] top-[284px] size-5" />
        <Coin className="absolute left-[29px] top-[402px] size-[34px]" />

        <h1 className="mt-[24px] text-center font-display text-[38px] font-bold uppercase leading-[40px] text-lime">
          Tu plata,
          <br />
          bajo control
        </h1>
        <p className="mx-auto mt-[16px] -rotate-3 bg-gold px-4 py-2 font-display text-xl font-bold uppercase leading-none text-forest">
          Sin vueltas
        </p>

        <div className="mt-auto flex flex-col items-center gap-[15px] pt-9">
          <Button onClick={handleSignIn} disabled={isRedirecting}>
            Arrancar
          </Button>
          <Button
            variant="ghost"
            onClick={handleSignIn}
            disabled={isRedirecting}
            className="text-cream"
          >
            Ya tengo cuenta
          </Button>
          {error && (
            <p role="alert" className="text-center text-sm text-blush">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
