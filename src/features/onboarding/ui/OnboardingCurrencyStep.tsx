import { ChevronDown } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { formatArs } from '@/shared/lib/money'

function ArgentinaFlag() {
  return (
    <svg viewBox="0 0 36 26" aria-hidden="true" className="h-[26px] w-9 rounded-[4px]">
      <rect width="36" height="26" fill="#74acdf" />
      <rect y="9" width="36" height="8" fill="#ffffff" />
      <circle cx="18" cy="13" r="2.4" fill="#f6b40e" />
    </svg>
  )
}

// Screen 04 — Moneda. Pesos only for the MVP: the selector is shown but has a single option.
export function OnboardingCurrencyStep({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <h1 className="mt-10 text-center font-display text-[32px] font-semibold leading-9 text-cream">
        ¿En qué moneda manejás tu plata?
      </h1>
      <p className="mt-3 text-center text-[17px] leading-6 text-text-muted-on-dark">
        En esta moneda vas a ver balances y totales.
      </p>

      <button
        type="button"
        disabled
        aria-label="Moneda: Peso argentino, ARS (por ahora es la única disponible)"
        className="mt-8 flex min-h-14 w-full items-center gap-3 rounded-full bg-canvas px-5 text-forest disabled:cursor-default"
      >
        <ArgentinaFlag />
        <span className="font-display text-xl font-semibold">Peso argentino</span>
        <span className="rounded-full bg-lime/60 px-3 py-0.5 font-display text-sm font-semibold">
          ARS
        </span>
        <ChevronDown aria-hidden="true" className="ml-auto size-5" strokeWidth={2} />
      </button>

      <p className="mt-8 text-center font-display text-sm font-semibold uppercase tracking-wider text-text-muted-on-dark">
        Así vas a ver tus números
      </p>
      <p className="mx-auto mt-3 w-fit rounded-lg border-2 border-dashed border-lime/30 px-8 py-4 font-display text-[34px] font-semibold text-cream">
        {formatArs(1_234_550)}
      </p>

      <div className="mt-auto pt-8">
        <Button onClick={onContinue}>Continuar</Button>
      </div>
    </>
  )
}
