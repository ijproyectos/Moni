import { BellRing, X } from 'lucide-react'
import { useContext, useState } from 'react'
import { Link } from 'react-router'
import { AuthContext } from '@/features/auth/api/authContext'
import { todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { useRecurringReminders } from '../api/useRecurringReminders'
import { readDismissal, reminderSignature, writeDismissal } from '../domain/reminderDismissal'

/**
 * "Mañana se cobra Netflix: $18.000 de Galicia" / "Hoy vence tu factura de luz. ¿Cuánto pagaste?". In-app
 * reminders only: Moni does not send push notifications yet, and says so. Renders nothing when there is nothing
 * to remind. The close button hides it for the current set of reminders (per user, until the set or the day changes).
 */
export function RecurringReminders({ className }: { className?: string }) {
  const reminders = useRecurringReminders()
  const userId = useContext(AuthContext)?.user?.id ?? 'anonymous'
  const signature = reminderSignature(
    reminders.map((r) => r.key),
    todayIso(),
  )
  // Kept in state too, so the notice closes even when localStorage throws.
  const [closed, setClosed] = useState<string | null>(null)
  if (reminders.length === 0) return null
  if (closed === signature || readDismissal(userId) === signature) return null

  function dismiss() {
    writeDismissal(userId, signature)
    setClosed(signature)
  }

  return (
    <section
      aria-label="Recordatorios de pagos"
      className={cn(
        'relative flex flex-col gap-2 rounded-[24px] border border-gold/60 bg-gold/25 p-4 pr-14',
        className,
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full text-ink"
      >
        <X aria-hidden="true" className="size-5" strokeWidth={2.25} />
      </button>
      {reminders.map((r) => (
        <Link
          key={r.key}
          to={r.to}
          className="flex items-start gap-3 text-[17px] font-extrabold leading-6 text-ink"
        >
          <BellRing aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {r.text}
        </Link>
      ))}
      <p className="text-[13px] leading-4 text-text-muted">
        Aviso dentro de Moni. Todavía no enviamos notificaciones push.
      </p>
    </section>
  )
}
