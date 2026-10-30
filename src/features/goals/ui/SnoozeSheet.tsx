import { useRef, useState } from 'react'
import { formatCompactDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { addDays, argentinaTodayIso, isIsoDate } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { OptionRow } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useSnoozeReminder } from '../api/useSavings'
import type { SavingsGoal } from '../domain/savings'

/** Posponer: tomorrow, in a week or a chosen date (up to 90 days). The saving schedule itself does not change. */
export function SnoozeSheet({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const toast = useToast()
  const snooze = useSnoozeReminder()
  const saving = useRef(false)
  const today = argentinaTodayIso()
  const tomorrow = addDays(today, 1)
  const [picking, setPicking] = useState(false)
  const [date, setDate] = useState(addDays(today, 3))
  const [error, setError] = useState<string | null>(null)

  async function apply(until: string) {
    if (saving.current) return
    saving.current = true
    setError(null)
    try {
      await snooze.mutateAsync({ goalId: goal.id, until })
      toast.show(`Te lo recordamos el ${formatCompactDate(until)}`)
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  const valid = isIsoDate(date) && date >= tomorrow && date <= addDays(today, 90)
  return (
    <BottomSheet title="Posponer recordatorio" subtitle={goal.name} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <OptionRow
          title="Mañana"
          subtitle={formatCompactDate(tomorrow)}
          onClick={() => void apply(tomorrow)}
        />
        <OptionRow
          title="En una semana"
          subtitle={formatCompactDate(addDays(today, 7))}
          onClick={() => void apply(addDays(today, 7))}
        />
        <OptionRow title="Elegir fecha" subtitle="Hasta 90 días" onClick={() => setPicking(true)} />
        {picking && (
          <div className="flex flex-col gap-3">
            <input
              type="date"
              aria-label="Nueva fecha del recordatorio"
              value={date}
              min={tomorrow}
              max={addDays(today, 90)}
              onChange={(e) => setDate(e.target.value)}
              className="h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink"
            />
            <Button disabled={!valid || snooze.isPending} onClick={() => void apply(date)}>
              Posponer
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
