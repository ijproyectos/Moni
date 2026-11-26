import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import { HomeHeader } from './HomeHeader'
import { MoniAgent } from '@/features/assistant/ui/MoniAgent'
import { QuickAdd } from '@/features/transactions/ui/QuickAdd'
import type { HomeBalance } from '../domain/homeBalance'
import { HomeHero } from './HomeHero'
import { RecentMovements, type MovementActions } from './RecentMovements'

interface HomeScreenProps {
  /** Everything about the current month: totals, categories. */
  summary: MonthSummary
  /** Newest movements across the whole history. Defaults to the month's own. */
  movements?: readonly RecentMovement[]
  /** Edit and void from the list; without it the rows are plain. */
  movementActions?: MovementActions
  /** First name for the greeting. */
  name?: string | null
  /** "Lo que tenés": the real sum of the payment methods, how many there are and where most of it is. */
  balance?: HomeBalance
}

export function HomeScreen({
  summary,
  movements,
  movementActions,
  name = null,
  balance = { totalCents: 0, methodCount: 0 },
}: HomeScreenProps) {
  const recent = movements ?? summary.recent

  return (
    <div>
      <MoniAgent name={name} />
      <HomeHeader name={name} />

      <div className="flex flex-col gap-4 pb-4 pt-1">
        <HomeHero balance={balance} />
        <QuickAdd />
        {recent.length > 0 ? (
          <RecentMovements movements={recent} actions={movementActions} variant="latest" />
        ) : (
          <section aria-labelledby="recent-title" className="mx-[18px] flex flex-col gap-2">
            <h2
              id="recent-title"
              className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-[#0B3D2E] dark:text-ink"
            >
              Movimientos
            </h2>
            <p className="rounded-[20px] bg-[#FAF8EC] px-4 py-3 text-[14px] text-[#566A5C] dark:bg-card dark:text-text-muted">
              Todavía no hay movimientos. Cargá tu primer gasto o ingreso y aparece acá.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
