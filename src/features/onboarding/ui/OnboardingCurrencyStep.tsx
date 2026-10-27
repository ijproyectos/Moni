import { Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { formatArs } from '@/shared/lib/money'
import { OnboardingTitle } from './OnboardingTitle'

function ArgentinaFlag() {
  return (
    <svg viewBox="0 0 36 26" aria-hidden="true" className="h-[26px] w-9 rounded-[4px]">
      <rect width="36" height="26" fill="#74acdf" />
      <rect y="9" width="36" height="8" fill="#ffffff" />
      <circle cx="18" cy="13" r="2.4" fill="#f6b40e" />
    </svg>
  )
}

// Screen 010 — Moneda. Pesos are the main currency; dollars are an optional second one (not persisted yet).
export function OnboardingCurrencyStep({ onContinue }: { onContinue: () => void }) {
  const [usesDollars, setUsesDollars] = useState(true)

  return (
    <>
      <OnboardingTitle
        title="¿En qué moneda manejás tu plata?"
        subtitle="Por ahora Moni funciona en pesos argentinos. Si también usás dólares, sumalos como segunda moneda."
      />

      <div
        aria-label="Moneda principal: Peso argentino, ARS"
        className="mx-auto mt-8 flex min-h-[60px] w-fit items-center gap-3 rounded-full bg-canvas px-5 text-forest"
      >
        <ArgentinaFlag />
        <span className="font-display text-[20px] font-extrabold">Peso argentino</span>
        <span className="rounded-full bg-lime/60 px-3 py-0.5 text-sm font-extrabold">ARS</span>
      </div>

      <p className="mt-8 text-center text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
        Así vas a ver tus números
      </p>
      <p className="mx-auto mt-3 w-fit rounded-[24px] border-2 border-dashed border-lime/30 px-5 py-3 font-display text-[38px] font-extrabold text-cream">
        {formatArs(1_234_550)}
      </p>

      <button
        type="button"
        role="checkbox"
        aria-checked={usesDollars}
        onClick={() => setUsesDollars((v) => !v)}
        className="mt-6 flex w-full items-center gap-4 rounded-[20px] bg-surface px-4 py-3 text-left"
      >
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-forest/60 text-[15px] font-extrabold text-lime"
        >
          US$
        </span>
        <span className="flex-1">
          <span className="block text-[17px] font-extrabold text-cream">También uso dólares</span>
          <span className="block text-[14px] text-text-muted-on-dark">
            Sumalos como segunda moneda
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-[8px] border-2',
            usesDollars ? 'border-lime bg-lime text-forest' : 'border-text-muted-on-dark',
          )}
        >
          {usesDollars && <Check className="size-5" strokeWidth={3} />}
        </span>
      </button>

      <div className="mt-auto pt-8">
        <Button onClick={onContinue}>Continuar</Button>
      </div>
    </>
  )
}
