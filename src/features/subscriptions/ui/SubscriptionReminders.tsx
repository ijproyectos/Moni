import { BellRing } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/ui/cn'
import { useSubscriptionReminders } from '../api/useSubscriptions'

/**
 * "Mañana se cobra Netflix: $18.000 de Galicia". In-app reminders only: Moni does not send push
 * notifications yet, and says so. Renders nothing when there is nothing to remind.
 */
export function SubscriptionReminders({ className }: { className?: string }) {
  const reminders = useSubscriptionReminders()
  if (reminders.length === 0) return null
  return (
    <section
      aria-label="Cobros de mañana"
      className={cn(
        'flex flex-col gap-2 rounded-[24px] border border-gold/60 bg-gold/25 p-4',
        className,
      )}
    >
      {reminders.map((r) => (
        <Link
          key={r.subscriptionId}
          to="/fijos"
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
