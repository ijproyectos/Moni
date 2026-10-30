import type { ReactNode } from 'react'
import { Link } from 'react-router'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import { formatMonthName, formatRelativeDay } from '@/shared/lib/dates'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CategoryIconCircle, IconCircle } from '@/shared/ui/IconCircle'
import { EmptyState } from '@/shared/ui/EmptyState'
import { MovementRow } from '@/shared/ui/MovementRow'
import { Scale, ShoppingBag, Target } from 'lucide-react'
import { progress, percentLabel } from '@/features/goals/domain/goals'
import { useGoals } from '@/features/goals/mock/goalsStore'
import { BudgetAlertsCard } from '@/features/budgets/ui/BudgetAlertsCard'
import { useAnts } from '@/features/insights/api/useAnts'
import { formatArs } from '@/shared/lib/money'
import { MoniGlyph, ProgressBar } from '@/shared/ui/kit'
import type { MonthSummary } from '../domain/monthSummary'
import { addsToBalance, isAdjustment, isOpening } from '@/features/transactions/domain/transaction'
import { buildInsight } from '../domain/insight'
import { CategoryDonut } from './CategoryDonut'
import { HomeHeader } from './HomeHeader'

interface HomeScreenProps {
  summary: MonthSummary
  month: IsoDate
  latestMonth: IsoDate
  onMonthChange: (month: IsoDate) => void
  initial: string
  onAddMovement: () => void
  /** Shortcut cards chosen by the person's goals (all shown by default). */
  shortcuts?: { savings: boolean; ants: boolean }
  /** In-app reminders shown above the insight (e.g. tomorrow's subscription charges). */
  reminders?: ReactNode
  /** Reminders counted next to the unread notices on the bell. */
  reminderCount?: number
}

export function HomeScreen({
  summary,
  month,
  latestMonth,
  onMonthChange,
  initial,
  onAddMovement,
  shortcuts = { savings: true, ants: true },
  reminders,
  reminderCount = 0,
}: HomeScreenProps) {
  const today = todayIso()
  const hasData =
    summary.byCategory.length > 0 || summary.recent.length > 0 || summary.incomeCents > 0
  const monthName = formatMonthName(month)

  return (
    <>
      <HomeHeader
        month={month}
        latestMonth={latestMonth}
        onMonthChange={onMonthChange}
        initial={initial}
        balanceCents={summary.balanceCents}
        incomeCents={summary.incomeCents}
        expenseCents={summary.expenseCents}
        reminderCount={reminderCount}
      />

      <div className="flex flex-col gap-4 px-4 pt-4">
        {reminders}

        <Card className="flex items-center gap-4 rounded-[24px] p-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40 text-forest">
            <MoniGlyph className="size-9" />
          </span>
          <p className="text-[17px] leading-6 text-forest">
            <strong className="font-extrabold">Moni dice:</strong>{' '}
            {buildInsight(summary.byCategory)}
          </p>
        </Card>

        {!hasData ? (
          <Card>
            <EmptyState
              mascotUrl={mascotAssistant}
              title="Todavía no hay movimientos"
              description={`Cargá tu primer gasto o ingreso de ${monthName.toLowerCase()} y Moni arma el resumen.`}
              action={<Button onClick={onAddMovement}>Cargar movimiento</Button>}
            />
          </Card>
        ) : (
          <>
            <Card className="rounded-[24px] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="whitespace-nowrap font-display text-[20px] font-extrabold">
                  Gastos por categoría
                </h2>
                <Link
                  to="/actividad"
                  className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-sand bg-canvas px-3 font-display text-[14px] font-extrabold"
                >
                  Ver movimientos
                </Link>
              </div>
              {summary.byCategory.length > 0 ? (
                <CategoryDonut slices={summary.byCategory} totalCents={summary.expenseCents} />
              ) : (
                <EmptyState
                  mascotUrl={mascotAnalyst}
                  title="Sin gastos este mes"
                  description="Cuando cargues gastos, acá ves en qué categorías se van."
                />
              )}
            </Card>

            <BudgetAlertsCard month={month} />

            <HomeShortcuts showSavings={shortcuts.savings} showAnts={shortcuts.ants} />

            {summary.recent.length > 0 && (
              <section aria-labelledby="recent-title">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 id="recent-title" className="font-display text-xl font-extrabold">
                    Últimos movimientos
                  </h2>
                  <Link
                    to="/actividad"
                    className="flex min-h-11 items-center text-[15px] font-semibold underline"
                  >
                    Ver todos
                  </Link>
                </div>
                <Card className="py-1">
                  <ul className="divide-y divide-cream">
                    {summary.recent.map((m) => {
                      const isIncome = addsToBalance(m.kind)
                      return (
                        <li key={m.id}>
                          <MovementRow
                            leading={
                              isAdjustment(m.kind) || isOpening(m.kind) ? (
                                <IconCircle icon={Scale} color="#064735" />
                              ) : (
                                <CategoryIconCircle
                                  iconName={m.categoryIcon}
                                  color={m.categoryColor}
                                />
                              )
                            }
                            title={m.note?.trim() || m.categoryName || 'Movimiento'}
                            subtitle={`${formatRelativeDay(m.occurredOn, today)} · ${m.categoryName ?? m.accountName}`}
                            trailing={
                              <AmountDisplay
                                cents={isIncome ? m.amountCents : -m.amountCents}
                                signed
                                className={isIncome ? 'text-income' : 'text-expense'}
                              />
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Metas (simulated) and Hormigas (real data) shortcut cards, shown according to the person's goals. */
function HomeShortcuts({ showSavings, showAnts }: { showSavings: boolean; showAnts: boolean }) {
  const ants = useAnts(todayIso())
  const goals = useGoals().filter((g) => !g.shared)
  const saved = goals.reduce((sum, g) => sum + g.savedCents, 0)
  const target = goals.reduce((sum, g) => sum + g.targetCents, 0)
  const value = target > 0 ? progress({ savedCents: saved, targetCents: target }) : 0
  if (!showSavings && !showAnts) return null
  return (
    <div className={showSavings && showAnts ? 'grid grid-cols-2 gap-3' : 'grid gap-3'}>
      {showSavings && (
        <Link to="/metas" className="rounded-[24px] border border-cream bg-white p-4">
          <span className="flex items-center gap-2 text-[18px] font-extrabold">
            <Target aria-hidden="true" className="size-5" strokeWidth={2.25} /> Metas
          </span>
          <ProgressBar value={value} className="mt-3" label="Avance de tus metas" />
          <span className="mt-1.5 block text-[15px] text-text-muted">
            {percentLabel(value)} juntado
          </span>
        </Link>
      )}
      {showAnts && (
        <Link to="/hormigas" className="rounded-[24px] border border-cream bg-white p-4">
          <span className="flex items-center gap-2 text-[18px] font-extrabold">
            <ShoppingBag aria-hidden="true" className="size-5" strokeWidth={2.25} /> Hormigas
          </span>
          <span className="mt-2 block font-display text-[22px] font-extrabold leading-7">
            {ants.data ? formatArs(ants.data.monthTotalCents) : '—'}
          </span>
          <span className="block text-[15px] text-text-muted">este mes</span>
        </Link>
      )}
    </div>
  )
}
