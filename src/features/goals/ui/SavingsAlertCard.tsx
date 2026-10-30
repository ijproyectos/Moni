import { Link } from 'react-router'
import { TriangleAlert } from 'lucide-react'
import { formatArs } from '@/shared/lib/money'
import { cn } from '@/shared/ui/cn'
import { alertText, type SavingsAlert } from '../domain/savings'

/**
 * "¡Ojo con tus ahorros!": ONE card per account whose balance no longer covers what its goals reserve, naming the goals
 * involved. Informative: nothing is blocked and no reserve is changed until the person decides.
 */
export function SavingsAlertCard({
  alert,
  className,
}: {
  alert: SavingsAlert
  className?: string
}) {
  return (
    <section
      aria-label={`Ahorros comprometidos en ${alert.accountName}`}
      className={cn(
        'flex flex-col gap-2 rounded-[24px] border border-expense/40 bg-blush/50 p-4',
        className,
      )}
    >
      <p className="flex items-start gap-2 text-[16px] leading-6">
        <TriangleAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-expense" />
        <span>{alertText(alert)}</span>
      </p>
      {alert.goals.length > 0 && (
        <ul className="ml-7 flex flex-col gap-0.5 text-[15px] leading-5">
          {alert.goals.map((g) => (
            <li key={g.id}>
              <Link to={`/metas/${g.id}`} className="font-extrabold underline">
                {g.name}
              </Link>{' '}
              · {formatArs(g.reservedCents)}
            </li>
          ))}
        </ul>
      )}
      <p className="ml-7 text-[14px] leading-5 text-text-muted">
        No tocamos tus reservas: podés bajarlas desde cada meta cuando quieras.
      </p>
    </section>
  )
}
