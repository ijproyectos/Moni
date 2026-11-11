import { useState } from 'react'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { AmountInput } from '@/shared/ui/AmountInput'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { MINT_PILL } from '@/shared/ui/mentaStyles'
import { leftoverPercent, PAY_DAY_CHOICES, parsePayDay, suggestedBudgetCents } from '../domain/income'
import { SkipAllLink } from './SkipAllLink'

export interface IncomeAnswer {
  incomeCents: number
  payDay: number | null
}

const CHIP = `rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${FOCUS_RING}`

// Screen 017 — Configurar ingresos.
export function OnboardingIncomeStep({
  initial,
  onContinue,
  onSkip,
  onSkipAll,
  isBusy = false,
}: {
  initial: IncomeAnswer | null
  onContinue: (answer: IncomeAnswer) => void
  onSkip: () => void
  onSkipAll: () => void
  isBusy?: boolean
}) {
  const [salary, setSalary] = useState(initial?.incomeCents ? formatAmountInput(initial.incomeCents) : '')
  const [extra, setExtra] = useState<string | null>(null)
  const startsOnChoice = initial?.payDay != null && (PAY_DAY_CHOICES as readonly number[]).includes(initial.payDay)
  const [payDay, setPayDay] = useState<number | 'other' | null>(
    initial?.payDay == null ? null : startsOnChoice ? initial.payDay : 'other',
  )
  const [otherDay, setOtherDay] = useState(!startsOnChoice && initial?.payDay ? String(initial.payDay) : '')

  const total = (parseAmountInput(salary) ?? 0) + (extra === null ? 0 : (parseAmountInput(extra) ?? 0))
  const resolvedDay = payDay === 'other' ? parsePayDay(otherDay) : payDay
  const budget = suggestedBudgetCents(total)

  return (
    <div className="flex flex-1 flex-col gap-3 pt-3">
      <h1 className="pt-2 text-balance font-display text-[28px] font-bold leading-[1.1] tracking-[-0.03em]">
        ¿Cuánto cobrás por mes?
      </h1>
      <p className="-mt-1.5 text-[14px] text-text-muted">
        Con esto calculo tu disponible de cada día. Lo podés cambiar cuando quieras.
      </p>

      <section className="flex flex-col gap-2.5 rounded-[26px] bg-card px-[18px] py-4">
        <Kicker as="span">Ingreso mensual</Kicker>
        <AmountInput
          aria-label="Ingreso mensual"
          scale="hero"
          className="!justify-start"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <span className={cn(CHIP, 'bg-ok-bg text-ok-ink')}>Sueldo fijo</span>
          <button
            type="button"
            aria-pressed={extra !== null}
            onClick={() => setExtra((v) => (v === null ? '' : null))}
            className={cn(CHIP, extra !== null ? 'bg-ok-bg text-ok-ink' : 'bg-sand text-[#4F6157] dark:text-text-muted')}
          >
            + Otro ingreso
          </button>
        </div>
        {extra !== null && (
          <AmountInput
            aria-label="Otro ingreso"
            scale="md"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
        )}
      </section>

      <section className="flex flex-col gap-2.5 rounded-[26px] bg-card px-4 py-3.5">
        <h2 className="text-[15px] font-bold">¿Qué día cobrás?</h2>
        <div role="group" aria-label="Día de cobro" className="grid grid-cols-5 gap-2">
          {[...PAY_DAY_CHOICES, 'other' as const].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={payDay === d}
              onClick={() => setPayDay(d)}
              className={cn(
                'h-[42px] rounded-[14px] text-[15px] font-semibold',
                FOCUS_RING,
                payDay === d ? 'bg-mint text-white' : 'bg-sand',
              )}
            >
              {d === 'other' ? 'Otro' : d}
            </button>
          ))}
        </div>
        {payDay === 'other' && (
          <label className="flex items-center gap-2 text-[14px] text-text-muted">
            Día del mes
            <input
              inputMode="numeric"
              maxLength={2}
              aria-label="Otro día de cobro"
              value={otherDay}
              onChange={(e) => setOtherDay(e.target.value.replace(/\D/g, ''))}
              className={cn('h-10 w-16 rounded-[12px] bg-sand px-3 text-center text-[15px] font-semibold text-ink', FOCUS_RING)}
            />
          </label>
        )}
      </section>

      {budget > 0 && (
        <div className="flex gap-3 rounded-[24px] bg-lilac-soft p-3.5">
          <img src={mascotUrl} alt="" className="size-9 shrink-0 rounded-full border-2 border-lilac bg-card object-cover" />
          <div className="flex flex-col gap-[3px]">
            <p className="text-[15px] font-bold text-lilac-ink">
              Te sugiero un presupuesto de <AmountDisplay cents={budget} />
            </p>
            <p className="text-[13px] text-[#4A3F96] dark:text-text-muted">
              Así te queda un {leftoverPercent(total)}% para ahorrar cada mes.
            </p>
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col items-stretch gap-1 pt-4">
        <button
          type="button"
          disabled={isBusy || total <= 0}
          onClick={() => onContinue({ incomeCents: total, payDay: resolvedDay })}
          className={cn(MINT_PILL, 'h-[54px] text-[16px] font-bold')}
        >
          Continuar
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onSkip}
          className={cn('min-h-11 rounded-full text-[15px] font-semibold text-text-muted', FOCUS_RING)}
        >
          Saltar
        </button>
        <SkipAllLink disabled={isBusy} onClick={onSkipAll} />
      </div>
    </div>
  )
}
