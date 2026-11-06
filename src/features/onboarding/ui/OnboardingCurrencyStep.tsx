import { Check } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { formatArs } from '@/shared/lib/money'
import { OnboardingTitle } from './OnboardingTitle'
import { SkipAllLink } from './SkipAllLink'

function ArgentinaFlag() {
  return (
    <svg viewBox="0 0 36 26" aria-hidden="true" className="h-[26px] w-9 rounded-[4px]">
      <rect width="36" height="26" fill="#74acdf" />
      <rect y="9" width="36" height="8" fill="#ffffff" />
      <circle cx="18" cy="13" r="2.4" fill="#f6b40e" />
    </svg>
  )
}

function UsaBadge() {
  return (
    <span
      aria-hidden="true"
      className="flex h-[22px] w-9 items-center justify-center rounded-[4px] bg-[#3c3b6e] text-[9px] font-extrabold tracking-wide text-white"
    >
      USA
    </span>
  )
}

function CurrencyRow({
  flag,
  name,
  code,
  label,
  dim = false,
}: {
  flag: React.ReactNode
  name: string
  code: string
  label: string
  dim?: boolean
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-[28px] border border-line bg-card px-5 text-ink transition-opacity',
        dim && 'opacity-55',
      )}
    >
      {flag}
      <span className="flex-1 font-display text-[19px] font-extrabold">{name}</span>
      <span className="rounded-full bg-[#daf1de] px-3 py-0.5 text-sm font-extrabold dark:bg-sand">
        {code}
      </span>
    </div>
  )
}

// Screen 010 — Moneda. Pesos are the main currency; dollars are an optional second one.
export function OnboardingCurrencyStep({
  usesDollars,
  onUsesDollarsChange,
  onContinue,
  onSkip,
  onSkipAll,
  isBusy = false,
}: {
  usesDollars: boolean
  onUsesDollarsChange: (value: boolean) => void
  onContinue: () => void
  /** Skips this step (pesos only) and goes on. */
  onSkip: () => void
  /** Asks to finish the whole onboarding with the defaults. */
  onSkipAll: () => void
  isBusy?: boolean
}) {
  return (
    <>
      <OnboardingTitle
        title="¿En qué moneda manejás tu plata?"
        subtitle="Por ahora Moni funciona en pesos argentinos. Si también usás dólares, sumalos como segunda moneda."
      />

      <div className="mt-6 flex flex-col gap-3">
        <CurrencyRow
          flag={<ArgentinaFlag />}
          name="Peso argentino"
          code="ARS"
          label="Moneda principal: Peso argentino, ARS"
        />
        <CurrencyRow
          flag={<UsaBadge />}
          name="Dólar"
          code="USD"
          label={
            usesDollars ? 'Segunda moneda: Dólar, USD' : 'Segunda moneda disponible: Dólar, USD'
          }
          dim={!usesDollars}
        />
      </div>

      <p className="mt-7 text-center text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
        Así vas a ver tus números
      </p>
      <p className="mx-auto mt-3 w-full rounded-[24px] border-2 border-dashed border-line px-5 py-4 text-center font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-none text-ink">
        {formatArs(1_234_550)}
      </p>

      <button
        type="button"
        role="checkbox"
        aria-checked={usesDollars}
        onClick={() => onUsesDollarsChange(!usesDollars)}
        className="mt-6 flex w-full items-center gap-4 border-y border-line px-1 py-4 text-left"
      >
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#daf1de] text-[14px] font-extrabold text-ink dark:bg-sand"
        >
          US$
        </span>
        <span className="flex-1">
          <span className="block text-[17px] font-extrabold text-ink">También uso dólares</span>
          <span className="block text-[14px] text-text-muted">Sumalos como segunda moneda</span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-[8px] border-2',
            usesDollars
              ? 'border-forest bg-forest text-cream dark:border-lime dark:bg-lime dark:text-forest'
              : 'border-line',
          )}
        >
          {usesDollars && <Check className="size-5" strokeWidth={3} />}
        </span>
      </button>

      <div className="mt-auto flex flex-col items-center gap-1 pt-8">
        <Button onClick={onContinue}>Continuar</Button>
        <Button variant="ghost" disabled={isBusy} onClick={onSkip} className="text-text-muted">
          Saltar
        </Button>
        <SkipAllLink disabled={isBusy} onClick={onSkipAll} />
      </div>
    </>
  )
}
