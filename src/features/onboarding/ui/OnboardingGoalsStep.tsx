import { Check } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { GOAL_OPTIONS } from '../domain/goals'
import { OnboardingTitle } from './OnboardingTitle'

interface OnboardingGoalsStepProps {
  selected: readonly string[]
  onToggle: (id: string) => void
  onContinue: () => void
  onSkip: () => void
}

// Screen 002 — Objetivos: a flat list with a check on the right (no cards, no icons).
export function OnboardingGoalsStep({
  selected,
  onToggle,
  onContinue,
  onSkip,
}: OnboardingGoalsStepProps) {
  return (
    <>
      <OnboardingTitle
        title="¿Qué querés lograr con Moni?"
        subtitle="Elegí todas las que quieras. Así armamos la app a tu medida."
      />

      <ul className="mt-6 flex flex-col border-b border-line">
        {GOAL_OPTIONS.map((goal) => {
          const checked = selected.includes(goal.id)
          return (
            <li key={goal.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                aria-pressed={checked}
                onClick={() => onToggle(goal.id)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-4 rounded-[16px] px-3 py-3 text-left text-[17px] font-extrabold leading-[22px] text-ink transition-colors',
                  checked && 'bg-[#e3ebd3] dark:bg-sand',
                )}
              >
                <span className="flex-1">{goal.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                    checked
                      ? 'border-forest bg-forest text-cream dark:border-lime dark:bg-lime dark:text-on-bright'
                      : 'border-line',
                  )}
                >
                  {checked && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-1 pt-6">
        <Button onClick={onContinue}>Continuar</Button>
        <Button variant="ghost" onClick={onSkip} className="text-text-muted">
          Saltar
        </Button>
      </div>
    </>
  )
}
