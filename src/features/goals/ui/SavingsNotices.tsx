import { BellRing } from 'lucide-react'
import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/ui/cn'
import { useToast } from '@/shared/ui/toastContext'
import { useGoalReminders, useSavings, useSavingsAlerts, useSkipReminder } from '../api/useSavings'
import type { GoalReminder } from '../domain/savings'
import { GoalMoneySheet } from './GoalMoneySheet'
import { SavingsAlertCard } from './SavingsAlertCard'
import { SnoozeSheet } from './SnoozeSheet'

/**
 * What Moni tells about savings, inside the app only (Inicio, the bell and Avisos): the accounts whose reserves are no
 * longer covered (one card per account) and the goals whose reminder is due (one per goal, with its three answers:
 * add a contribution, postpone or skip). Nothing is contributed or charged automatically. Renders nothing when quiet.
 */
export function SavingsNotices({ className }: { className?: string }) {
  const toast = useToast()
  const savings = useSavings()
  const alerts = useSavingsAlerts()
  const reminders = useGoalReminders()
  const skip = useSkipReminder()
  const [adding, setAdding] = useState<GoalReminder | null>(null)
  const [postponing, setPostponing] = useState<GoalReminder | null>(null)

  if (alerts.length === 0 && reminders.length === 0) return null

  async function skipReminder(reminder: GoalReminder) {
    try {
      await skip.mutateAsync(reminder.goal.id)
      toast.show('Listo, lo salteamos')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {alerts.map((alert) => (
        <SavingsAlertCard key={alert.accountId} alert={alert} />
      ))}
      {reminders.map((r) => (
        <section
          key={r.goal.id}
          aria-label={`Recordatorio de ahorro: ${r.goal.name}`}
          className="flex flex-col gap-3 rounded-[24px] border border-gold/40 bg-tint-gold p-4"
        >
          <p className="flex items-start gap-3 text-[17px] font-extrabold leading-6 text-ink">
            <BellRing aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {r.text}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => setAdding(r)}
              aria-label={`Agregar un aporte a ${r.goal.name}`}
              className="min-h-12 rounded-full bg-forest px-6 font-display text-[17px] font-extrabold text-cream dark:bg-lime dark:text-on-bright"
            >
              Agregar un aporte
            </button>
            <button
              type="button"
              onClick={() => setPostponing(r)}
              aria-label={`Posponer el recordatorio de ${r.goal.name}`}
              className="min-h-11 text-[15px] font-extrabold text-ink underline"
            >
              Posponer
            </button>
            <button
              type="button"
              disabled={skip.isPending}
              onClick={() => void skipReminder(r)}
              aria-label={`Omitir el recordatorio de ${r.goal.name}`}
              className="min-h-11 text-[15px] font-extrabold text-ink underline disabled:opacity-50"
            >
              Omitir
            </button>
          </div>
        </section>
      ))}
      {reminders.length > 0 && (
        <p className="text-[13px] leading-4 text-text-muted">
          Aviso dentro de Moni. No aportamos ni descontamos nada solos, y todavía no enviamos
          notificaciones push.
        </p>
      )}
      {adding && (
        <GoalMoneySheet
          goal={adding.goal}
          account={savings.data?.accounts.find((a) => a.id === adding.goal.accountId)}
          mode="deposit"
          onClose={() => setAdding(null)}
        />
      )}
      {postponing && <SnoozeSheet goal={postponing.goal} onClose={() => setPostponing(null)} />}
    </div>
  )
}
