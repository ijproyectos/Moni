import { formatMonthShortYear, monthNameOf } from '@/shared/lib/dates'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { ProgressRing } from '@/shared/ui/ProgressRing'
import { barValue, percentText, type SavingsGoal } from '../domain/savings'
import { simulate, type MonthlyRow, averageSaved } from '../domain/savingsPlan'

/** "A este ritmo, llegás en julio de 2027": only from the person's real recent savings in this goal. */
function paceLine(
  goal: SavingsGoal,
  today: string,
  rows: readonly MonthlyRow[] | null,
): { text: string; reached: boolean } | null {
  if (goal.status !== 'active') return null
  if (goal.reservedCents >= goal.targetCents) return null
  const average = rows ? averageSaved(goal.id, today, rows) : 0
  const sim = average > 0 ? simulate(goal, average, today) : null
  if (sim) {
    return {
      text: `A este ritmo, llegás en ${monthNameOf(sim.reachedMonth)} de ${sim.reachedMonth.slice(0, 4)}`,
      reached: true,
    }
  }
  if (goal.reservedCents === 0) return { text: 'Todavía sin aportes', reached: false }
  if (goal.targetDate) return { text: `Para ${formatMonthShortYear(goal.targetDate)}`, reached: false }
  return null
}

/** A goal of the Menta design: progress ring, name, "reserved of target" and the pace line. */
export function GoalRingCard({
  goal,
  today,
  rows,
  onOpen,
}: {
  goal: SavingsGoal
  today: string
  rows: readonly MonthlyRow[] | null
  onOpen: () => void
}) {
  const pace = paceLine(goal, today, rows)
  const value = barValue(goal)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${goal.name}, ${percentText(goal)} reservado`}
      className={cn(
        'grid w-full grid-cols-[64px_1fr] items-center gap-3.5 rounded-[28px] bg-card px-4 py-3.5 text-left',
        FOCUS_RING,
      )}
    >
      <ProgressRing value={value} label={percentText(goal)} />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate text-[15.5px] font-semibold">{goal.name}</span>
        <span className="text-[13px] text-[#4F6157] dark:text-text-muted">
          <AmountDisplay cents={goal.reservedCents} /> de <AmountDisplay cents={goal.targetCents} />
        </span>
        {pace && (
          <span
            className={cn(
              'text-[12.5px] font-medium',
              pace.reached ? 'text-mint-ink' : 'text-text-muted',
            )}
          >
            {pace.text}
          </span>
        )}
      </span>
    </button>
  )
}
