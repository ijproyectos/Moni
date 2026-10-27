import {
  Check,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { GOAL_OPTIONS } from '../domain/goals'

const GOAL_ICONS: Record<string, LucideIcon> = {
  track_spending: Search,
  save_monthly: Target,
  split_expenses: UsersRound,
  control_recurring: RefreshCw,
  all: Sparkles,
}

interface OnboardingGoalsStepProps {
  selected: readonly string[]
  onToggle: (id: string) => void
  onContinue: () => void
  onSkip: () => void
}

// Screen 02 — Objetivos.
export function OnboardingGoalsStep({
  selected,
  onToggle,
  onContinue,
  onSkip,
}: OnboardingGoalsStepProps) {
  return (
    <>
      <h1 className="mt-10 text-center font-display text-[32px] font-semibold leading-9 text-cream">
        ¿Qué querés lograr con Moni?
      </h1>
      <p className="mt-3 text-center text-[17px] leading-6 text-text-muted-on-dark">
        Elegí todas las que quieras. Así armamos la app a tu medida.
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        {GOAL_OPTIONS.map((goal) => {
          const checked = selected.includes(goal.id)
          const Icon = GOAL_ICONS[goal.id] ?? Sparkles
          return (
            <li key={goal.id}>
              <button
                type="button"
                aria-pressed={checked}
                onClick={() => onToggle(goal.id)}
                className={cn(
                  'flex min-h-[68px] w-full items-center gap-4 rounded-lg border-2 bg-surface px-4 py-3 text-left font-body text-[17px] text-cream transition',
                  checked ? 'border-lime' : 'border-lime/20',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-md bg-forest text-lime"
                >
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <span className="flex-1">{goal.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2',
                    checked ? 'border-lime bg-lime text-forest' : 'border-text-muted-on-dark',
                  )}
                >
                  {checked && <Check className="size-5" strokeWidth={3} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-2 pt-8">
        <Button onClick={onContinue}>Continuar</Button>
        <Button variant="ghost" onClick={onSkip} className="text-text-muted-on-dark">
          Saltar
        </Button>
      </div>
    </>
  )
}
