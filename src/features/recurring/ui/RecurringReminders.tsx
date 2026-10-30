import { BellRing } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/ui/cn'
import { useRecurringReminders } from '../api/useRecurringReminders'

/**
 * "Mañana se cobra Netflix: $18.000 de Galicia" / "Hoy vence tu factura de luz. ¿Cuánto pagaste?". In-app
 * reminders only: Moni does not send push notifications yet, and says so. Renders nothing when there is nothing
 * to remind.
 */
export function RecurringReminders({ className }: { className?: string }) {
  const reminders = useRecurringReminders()
  if (reminders.length === 0) return null
  return (
    <section
      aria-label="Recordatorios de pagos"
      className={cn(
        'flex flex-col gap-2 rounded-[24px] border border-gold/60 bg-gold/25 p-4',
        className,
      )}
    >
      {reminders.map((r) => (
        <Link
          key={r.key}
          to={r.to}
          className="flex items-start gap-3 text-[17px] font-extrabold leading-6 text-forest"
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
