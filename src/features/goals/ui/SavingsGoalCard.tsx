import { BellRing, TriangleAlert } from 'lucide-react'
import { formatShortDate } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { cn } from '@/shared/ui/cn'
import { IconTile, ProgressBar } from '@/shared/ui/kit'
import {
  barValue,
  exceededCents,
  missingCents,
  nextReminderLabel,
  percentText,
  savingsKind,
  type SavingsGoal,
} from '../domain/savings'

const STATUS_LABEL = {
  active: null,
  paused: 'Pausada',
  completed: 'Completada',
  archived: 'Archivada',
} as const

/**
 * A savings goal: how much is reserved of the target, with a bar that never breaks past 100 %, what is missing
 * (or by how much it was exceeded), the account that holds the money and the next reminder.
 */
export function SavingsGoalCard({
  goal,
  today,
  onOpen,
}: {
  goal: SavingsGoal
  today: string
  onOpen: () => void
}) {
  const kind = savingsKind(goal.icon)
  const exceeded = exceededCents(goal)
  const reminder = nextReminderLabel(goal, today)
  const status = STATUS_LABEL[goal.status]
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${goal.name}, ${percentText(goal)} reservado`}
      className="block w-full rounded-[24px] border border-sand bg-card p-4 text-left"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={kind.icon} bg={kind.bg} color={kind.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[19px] font-extrabold">{goal.name}</span>
          <span className="block truncate text-[15px] text-text-muted">
            {goal.accountName}
            {goal.targetDate ? ` · para el ${formatShortDate(goal.targetDate)}` : ''}
          </span>
        </span>
        <span className="font-display text-[24px] font-extrabold">{percentText(goal)}</span>
      </div>
      <ProgressBar value={barValue(goal)} className="mt-4" label={`Avance de ${goal.name}`} />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[15px] text-text-muted">
        <span>Reservado {formatArs(goal.reservedCents)}</span>
        <span>de {formatArs(goal.targetCents)}</span>
      </div>
      <p
        className={cn('mt-1 text-[15px] font-extrabold', exceeded > 0 ? 'text-income' : 'text-ink')}
      >
        {exceeded > 0
          ? `¡Superaste tu meta por ${formatArs(exceeded)}!`
          : `Faltan ${formatArs(missingCents(goal))}`}
      </p>
      {(status || reminder || !goal.accountUsable) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
          {status && (
            <span className="rounded-full bg-sand px-3 py-1 font-extrabold text-ink">{status}</span>
          )}
          {reminder && (
            <span className="inline-flex items-center gap-1 text-text-muted">
              <BellRing aria-hidden="true" className="size-4" /> {reminder}
            </span>
          )}
          {!goal.accountUsable && goal.status !== 'archived' && (
            <span className="inline-flex items-center gap-1 font-extrabold text-expense">
              <TriangleAlert aria-hidden="true" className="size-4" /> Cuenta no disponible
            </span>
          )}
        </div>
      )}
    </button>
  )
}
