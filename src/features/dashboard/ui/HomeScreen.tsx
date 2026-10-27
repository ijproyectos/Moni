import { Link } from 'react-router'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import { formatMonthName, formatRelativeDay } from '@/shared/lib/dates'
import { todayIso, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { EmptyState } from '@/shared/ui/EmptyState'
import { MovementRow } from '@/shared/ui/MovementRow'
import { Target } from 'lucide-react'
import { IconCircle } from '@/shared/ui/IconCircle'
import type { MonthSummary } from '../domain/monthSummary'
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
}

export function HomeScreen({
  summary,
  month,
  latestMonth,
  onMonthChange,
  initial,
  onAddMovement,
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
        availableCents={summary.availableBalanceCents}
      />

      <div className="flex flex-col gap-4 px-4 pt-4">
        <Card className="flex items-center gap-3">
          <IconCircle icon={Target} color="#F0AA2A" className="size-12 rounded-md" />
          <p className="text-[16px] leading-6 text-forest">
            <strong className="font-semibold">Moni dice:</strong> {buildInsight(summary.byCategory)}
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
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Gastos por categoría</h2>
                <Link
                  to="/actividad"
                  className="flex min-h-11 items-center rounded-full border border-cream bg-canvas px-4 font-display text-sm font-semibold"
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

            {summary.byCategory.length > 0 && (
              <section aria-labelledby="by-category-title">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 id="by-category-title" className="font-display text-xl font-semibold">
                    Por categoría
                  </h2>
                  <span className="text-[15px] text-text-muted">{monthName}</span>
                </div>
                <Card className="py-1">
                  <ul className="divide-y divide-cream">
                    {summary.byCategory.map((slice) => (
                      <li key={slice.categoryId}>
                        <MovementRow
                          leading={<CategoryIconCircle iconName={slice.icon} color={slice.color} />}
                          title={slice.name}
                          subtitle={`${Math.round(slice.percent)}% del total`}
                          trailing={
                            <AmountDisplay cents={-slice.amountCents} className="text-expense" />
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            )}

            {summary.recent.length > 0 && (
              <section aria-labelledby="recent-title">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 id="recent-title" className="font-display text-xl font-semibold">
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
                      const isIncome = m.kind === 'income'
                      return (
                        <li key={m.id}>
                          <MovementRow
                            leading={
                              <CategoryIconCircle
                                iconName={m.categoryIcon}
                                color={m.categoryColor}
                              />
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
