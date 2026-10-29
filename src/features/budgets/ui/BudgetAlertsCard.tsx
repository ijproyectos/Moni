import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import { formatArs } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { Card } from '@/shared/ui/Card'
import { ProgressBar } from '@/shared/ui/kit'
import { useBudgetStatus } from '../api/useBudgets'
import { budgetAlerts, type BudgetStatus } from '../domain/budget'

const MAX_ROWS = 3

function alertText(b: BudgetStatus): string {
  return b.state === 'over'
    ? `Te pasaste ${formatArs(-b.remainingCents)} en ${b.name}`
    : `${b.name}: llevás el ${Math.floor(b.percent)}%, te quedan ${formatArs(b.remainingCents)}`
}

/** Inicio card: categories that reached 80% of their monthly limit. Renders nothing when all is fine. */
export function BudgetAlertsCard({ month }: { month: IsoDate }) {
  const budgets = useBudgetStatus(month)
  const alerts = budgetAlerts(budgets.data ?? [])
  if (alerts.length === 0) return null

  return (
    <Card className="rounded-[24px] p-4" aria-label="Alertas de límites">
      <div className="flex items-center gap-3">
        <img src={mascotAlert} alt="" className="size-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] font-extrabold">Ojo con tus límites</h2>
          <p className="text-[15px] text-text-muted">
            {alerts.length === 1
              ? 'Una categoría está cerca o pasó su límite.'
              : `${alerts.length} categorías están cerca o pasaron su límite.`}
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {alerts.slice(0, MAX_ROWS).map((b) => (
          <li key={b.budgetId}>
            <p className="text-[16px] font-extrabold">{alertText(b)}</p>
            <ProgressBar
              value={Math.min(1, b.percent / 100)}
              label={`Límite de ${b.name}`}
              className="mt-1.5"
            />
          </li>
        ))}
      </ul>
      <Link
        to="/categorias"
        className="mt-3 flex min-h-11 items-center justify-center rounded-full border border-sand bg-canvas px-3 font-display text-[15px] font-extrabold"
      >
        Ver límites
      </Link>
    </Card>
  )
}
