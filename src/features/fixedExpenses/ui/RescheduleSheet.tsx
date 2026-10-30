import { useRef, useState } from 'react'
import { formatCompactDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { addDays, argentinaTodayIso, isIsoDate } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import { useRescheduleOccurrence } from '../api/useFixedExpenses'
import { billLabel } from '../domain/catalog'
import type { PendingBill } from '../domain/fixedExpense'

/** Moves the date a pending bill counts for (reminders follow it). The original due date is kept. */
export function RescheduleSheet({ bill, onClose }: { bill: PendingBill; onClose: () => void }) {
  const toast = useToast()
  const reschedule = useRescheduleOccurrence()
  const saving = useRef(false)
  const today = argentinaTodayIso()
  const min = addDays(today, -45)
  const max = addDays(today, 400)
  const [date, setDate] = useState(bill.date >= today ? bill.date : today)
  const [error, setError] = useState<string | null>(null)
  const valid = isIsoDate(date) && date >= min && date <= max

  async function save() {
    if (!valid || saving.current) return
    saving.current = true
    setError(null)
    try {
      await reschedule.mutateAsync({ occurrenceId: bill.occurrence.id, newDate: date })
      toast.show('Fecha cambiada')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  return (
    <BottomSheet title="Cambiar fecha" subtitle={bill.expense.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[16px] leading-6">
          Vencía el <strong>{formatCompactDate(bill.occurrence.dueOn)}</strong>. Elegí hasta cuándo
          lo querés tener presente: Moni te recuerda{' '}
          {billLabel(bill.expense.kindId, bill.expense.name)} en la nueva fecha. El vencimiento
          original se conserva en el historial.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Nueva fecha
          </span>
          <input
            type="date"
            value={date}
            min={min}
            max={max}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Nueva fecha"
            className="h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink"
          />
        </label>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button disabled={!valid || reschedule.isPending} onClick={() => void save()}>
          Guardar fecha
        </Button>
      </div>
    </BottomSheet>
  )
}
