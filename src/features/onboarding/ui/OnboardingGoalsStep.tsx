import {
  Check,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { GOAL_OPTIONS } from '../domain/goals'
import { OnboardingTitle } from './OnboardingTitle'

const GOAL_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  track_spending: { icon: Search, color: '#b8ec7c' },
  save_monthly: { icon: Target, color: '#ffc83d' },
  split_expenses: { icon: UsersRound, color: '#f5b8b0' },
  control_recurring: { icon: RefreshCw, color: '#7fd1c3' },
  plan_trips: { icon: Send, color: '#7fd1c3' },
  all: { icon: Sparkles, color: '#ffc83d' },
}

interface OnboardingGoalsStepProps {
  selected: readonly string[]
  onToggle: (id: string) => void
  onContinue: () => void
  onSkip: () => void
}

// Screen 002 — Objetivos.
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

      <ul className="mt-6 flex flex-col gap-3">
        {GOAL_OPTIONS.map((goal) => {
          const checked = selected.includes(goal.id)
          const { icon: Icon, color } = GOAL_ICONS[goal.id] ?? { icon: Sparkles, color: '#ffc83d' }
          return (
            <li key={goal.id}>
              <button
                type="button"
                aria-pressed={checked}
                onClick={() => onToggle(goal.id)}
                className={cn(
                  'flex min-h-[62px] w-full items-center gap-4 rounded-[20px] border-2 px-3 py-2 text-left text-[17px] font-semibold leading-[22px] text-cream transition',
                  checked ? 'border-lime bg-surface' : 'border-white/5 bg-surface/70',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest/60"
                  style={{ color }}
                >
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <span className="flex-1">{goal.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                    checked ? 'border-lime bg-lime text-forest' : 'border-text-muted-on-dark',
                  )}
                >
                  {checked && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-1 pt-4">
        <Button onClick={onContinue}>Continuar</Button>
        <Button variant="ghost" onClick={onSkip} className="text-text-muted-on-dark">
          Saltar
        </Button>
      </div>
    </>
  )
}
