import { useMemo, useState } from 'react'
import { formatAmountInput, formatAmountTyping, parseAmountInput } from '@/shared/lib/amountInput'
import { formatMonthShortYear } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { Panel } from '@/shared/ui/kit'
import { fieldClass } from '@/features/groups/ui/styles'
import { useSavingsPlanData } from '../api/useSavings'
import type { SavingsGoal, SavingsOverview } from '../domain/savings'
import { averageSaved, goalPlan, simulate, type GoalPlan } from '../domain/savingsPlan'

const monthYear = (month: string) => formatMonthShortYear(month)

function explain(plan: GoalPlan): string {
  switch (plan.state) {
    case 'done':
      return '¡Llegaste al monto de tu meta!'
    case 'overdue':
      return 'La fecha objetivo ya pasó. Editá la meta para ponerle una fecha nueva y calcular cuánto reservar.'
    case 'no_date':
      return 'Esta meta no tiene fecha objetivo. Ponele una para saber cuánto reservar por mes.'
    case 'paused':
      return 'La meta está en pausa: no pide aportes hasta que la reactives.'
    default:
      return ''
  }
}

/**
 * What the goal needs, month by month, and a simulator: type a monthly amount and see when the goal would be reached.
 * Simulating never changes the goal; only editing it does.
 */
export function GoalPlanSection({
  goal,
  overview,
}: {
  goal: SavingsGoal
  overview: SavingsOverview
}) {
  const planData = useSavingsPlanData()
  const input = useMemo(
    () =>
      planData.data ? { today: overview.today, goals: overview.goals, data: planData.data } : null,
    [planData.data, overview.today, overview.goals],
  )
  const plan = useMemo(() => (input ? goalPlan(goal, input) : null), [input, goal])
  const average = useMemo(
    () => (planData.data ? averageSaved(goal.id, overview.today, planData.data.months) : 0),
    [planData.data, goal.id, overview.today],
  )
  const [text, setText] = useState('')
  if (goal.status === 'archived') return null
  if (!plan) {
    return planData.isError ? (
      <Panel>
        <h2 className="text-[20px] font-extrabold">Plan de ahorro</h2>
        <p className="mt-1 text-[15px] text-text-muted">
          No pudimos cargar el historial de esta meta.
        </p>
      </Panel>
    ) : null
  }

  const typed = parseAmountInput(text)
  const simulation = typed ? simulate(goal, typed, overview.today) : null
  const scheduled = plan.state === 'planned' || plan.state === 'attention'

  return (
    <Panel className="flex flex-col gap-3">
      <h2 className="text-[20px] font-extrabold">Plan de ahorro</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[15px]">
        <div>
          <dt className="text-text-muted">Falta ahorrar</dt>
          <dd className="text-[19px] font-extrabold">{formatArs(plan.remainingCents)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Fecha objetivo</dt>
          <dd className="text-[19px] font-extrabold">
            {plan.targetMonth ? monthYear(plan.targetMonth) : 'Sin fecha'}
          </dd>
        </div>
        {scheduled && (
          <div className="col-span-2">
            <dt className="text-text-muted">Ahorro mensual necesario</dt>
            <dd className="text-[24px] font-extrabold">
              {formatArs(plan.needNowCents)}
              <span className="text-[15px] font-bold text-text-muted"> por mes</span>
            </dd>
            <dd className="text-[14px] leading-5 text-text-muted">
              {plan.monthsLeft === 1
                ? 'Es el último mes para llegar a tiempo.'
                : `Quedan ${plan.monthsLeft} meses hasta la fecha objetivo.`}
              {plan.state === 'attention' &&
                ' Queda poco tiempo y falta bastante: conviene revisar el plan.'}
            </dd>
          </div>
        )}
      </dl>
      {!scheduled && <p className="text-[15px] leading-5 text-text-muted">{explain(plan)}</p>}
      {scheduled && average > 0 && (
        <p className="text-[14px] leading-5 text-text-muted">
          En los últimos meses reservaste en promedio {formatArs(average)} por mes en esta meta.
        </p>
      )}

      {plan.remainingCents > 0 && goal.status !== 'completed' && (
        <div className="flex flex-col gap-2 border-t border-sand pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[16px] font-extrabold">Simulador</span>
            <span className="text-[14px] leading-5 text-text-muted">
              Probá cuánto ahorrar por mes y mirá cuándo llegarías. No cambia tu meta.
            </span>
            <input
              inputMode="decimal"
              aria-label="Ahorro mensual a simular"
              placeholder="Ej: 50.000"
              className={fieldClass}
              value={text}
              onChange={(e) => setText(formatAmountTyping(e.target.value))}
            />
          </label>
          {(scheduled || average > 0) && (
            <div className="flex flex-wrap gap-2">
              {scheduled && (
                <button
                  type="button"
                  onClick={() => setText(formatAmountInput(plan.needNowCents))}
                  className="min-h-9 rounded-full border border-line bg-card px-3 text-[14px] font-extrabold"
                >
                  Lo necesario: {formatArs(plan.needNowCents)}
                </button>
              )}
              {average > 0 && (
                <button
                  type="button"
                  onClick={() => setText(formatAmountInput(average))}
                  className="min-h-9 rounded-full border border-line bg-card px-3 text-[14px] font-extrabold"
                >
                  Mi promedio: {formatArs(average)}
                </button>
              )}
            </div>
          )}
          {typed === null && text.trim() !== '' && (
            <p role="alert" className="text-[14px] text-expense">
              Escribí un monto válido.
            </p>
          )}
          {simulation && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-[16px] bg-sand/60 px-3 py-2 text-[16px] leading-6"
            >
              Con {formatArs(typed ?? 0)} por mes llegarías en{' '}
              <strong className="font-extrabold">{monthYear(simulation.reachedMonth)}</strong>
              {simulation.onTime === true && ' · a tiempo para tu fecha objetivo.'}
              {simulation.onTime === false &&
                ` · ${simulation.monthsLate} ${simulation.monthsLate === 1 ? 'mes' : 'meses'} después de tu fecha objetivo.`}
              {simulation.onTime === null && '.'}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}
