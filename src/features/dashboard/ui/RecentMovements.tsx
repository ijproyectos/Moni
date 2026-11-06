import { Link } from 'react-router'
import { useState } from 'react'
import { addsToBalance, isAdjustment, isOpening } from '@/features/transactions/domain/transaction'
import { formatLongDate, formatLongDay, formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { RecentMovement } from '../domain/monthSummary'
import { groupMovementsByDay } from '../domain/recentMovements'
import { SwipeRow } from './SwipeRow'

/** What can be done with a movement from Inicio; the page decides it from the real transaction. */
export interface MovementActions {
  canEdit: (movement: RecentMovement) => boolean
  canVoid: (movement: RecentMovement) => boolean
  /** The movement is an installment: voiding it cancels the whole purchase. */
  isInstallment: (movement: RecentMovement) => boolean
  onEdit: (movement: RecentMovement) => void
  /** Rejects with a message fit for the person to read. */
  onVoid: (movement: RecentMovement) => Promise<void>
}

function titleOf(m: RecentMovement): string {
  if (isOpening(m.kind)) return 'Saldo inicial'
  if (isAdjustment(m.kind)) return 'Ajuste de saldo'
  return m.note?.trim() || m.categoryName || 'Movimiento'
}

function subtitleOf(m: RecentMovement): string {
  if (isOpening(m.kind) || isAdjustment(m.kind)) return m.accountName
  return `${m.categoryName ?? 'Sin categoría'} · ${m.accountName}`
}

/** How many movements Inicio lists before "Ver más movimientos". */
const COLLAPSED_COUNT = 5

/** "Hoy, 5 de noviembre", "Ayer, 4 de noviembre" or "1 de noviembre" (with the year when it is not this one). */
function dayHeading(date: string, today: string): string {
  const day = formatLongDate(date).replace(/ de \d{4}$/, '')
  const label = formatRelativeDay(date, today)
  const withYear = date.slice(0, 4) === today.slice(0, 4) ? day : formatLongDate(date)
  return label === 'Hoy' || label === 'Ayer' ? `${label}, ${day}` : withYear
}

/** "Movimientos": the newest ones by day, as plain rows. Swiping a row to the left reveals edit and void. */
export function RecentMovements({
  movements,
  total,
  actions,
  today = todayIso(),
}: {
  movements: readonly RecentMovement[]
  /** How many movements there are in all (the link to Actividad says it). */
  total?: number
  actions?: MovementActions
  /** Today, to say "Hoy" and "Ayer" on the day headings (a prop so it can be tested). */
  today?: string
}) {
  const [pending, setPending] = useState<RecentMovement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? movements : movements.slice(0, COLLAPSED_COUNT)
  const canExpand = movements.length > COLLAPSED_COUNT
  const days = groupMovementsByDay(shown)
  const anySwipe = actions ? movements.some((m) => actions.canEdit(m) || actions.canVoid(m)) : false

  async function confirmVoid() {
    if (!pending || !actions) return
    setBusy(true)
    setError(null)
    try {
      await actions.onVoid(pending)
      setPending(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos anular el movimiento.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="recent-title" className="border-t border-line py-5">
      <div className="mb-2 flex items-baseline justify-between px-5">
        <h2 id="recent-title" className="font-display text-[22px] font-extrabold">
          Movimientos
        </h2>
        <Link to="/actividad" className="flex min-h-11 items-center text-[15px] text-text-muted">
          {total ? `Ver los ${total}` : 'Ver todos'}
        </Link>
      </div>
      {days.map((day) => {
        return (
          <section key={day.date} aria-label={formatLongDay(day.date)}>
            <h3 className="px-5 pb-1 pt-2 text-[14px] font-semibold text-text-muted">
              {dayHeading(day.date, today)}
            </h3>
            <ul className="divide-y divide-line border-b border-line">
              {day.movements.map((m) => {
                const isIncome = addsToBalance(m.kind)
                const canEdit = actions?.canEdit(m) ?? false
                const canVoid = actions?.canVoid(m) ?? false
                const row = (
                  <div className="flex min-h-[60px] items-center gap-3 px-5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold leading-5 text-ink">
                        {titleOf(m)}
                      </span>
                      <span className="block truncate text-[13px] leading-[18px] text-text-muted">
                        {subtitleOf(m)}
                      </span>
                    </span>
                    <AmountDisplay
                      cents={isIncome ? m.amountCents : -m.amountCents}
                      signed
                      className={
                        isAdjustment(m.kind) || isOpening(m.kind)
                          ? 'text-[16px] font-bold text-ink'
                          : `text-[16px] font-bold ${isIncome ? 'text-income' : 'text-expense'}`
                      }
                    />
                  </div>
                )
                return (
                  <li key={m.id}>
                    {actions && (canEdit || canVoid) ? (
                      <SwipeRow
                        onPress={canEdit ? () => actions.onEdit(m) : undefined}
                        pressLabel={canEdit ? `Editar ${titleOf(m)}` : undefined}
                        actions={[
                          ...(canEdit
                            ? [
                                {
                                  label: 'Editar',
                                  tone: 'primary' as const,
                                  onPress: () => actions.onEdit(m),
                                },
                              ]
                            : []),
                          ...(canVoid
                            ? [
                                {
                                  label: 'Anular',
                                  tone: 'danger' as const,
                                  onPress: () => setPending(m),
                                },
                              ]
                            : []),
                        ]}
                      >
                        {row}
                      </SwipeRow>
                    ) : (
                      row
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mx-auto mt-2 flex min-h-11 items-center px-4 text-[15px] font-semibold text-text-muted"
        >
          {expanded ? 'Ver menos' : 'Ver más movimientos'}
        </button>
      )}
      {anySwipe && (
        <p className="px-5 pt-2 text-center text-[13px] text-text-muted">
          Deslizá un movimiento a la izquierda para editarlo.
        </p>
      )}
      {pending && actions && (
        <ConfirmDialog
          title={
            actions.isInstallment(pending)
              ? '¿Anular la compra en cuotas?'
              : '¿Anular este movimiento?'
          }
          message={
            error ??
            (actions.isInstallment(pending)
              ? 'Se anulan todas las cuotas de esta compra, también las que todavía no llegaron, y baja tu deuda. Esta acción no se puede deshacer.'
              : 'Lo sacamos de tus balances y totales. Esta acción no se puede deshacer.')
          }
          confirmLabel="Anular"
          isBusy={busy}
          onConfirm={() => void confirmVoid()}
          onCancel={() => {
            setPending(null)
            setError(null)
          }}
        />
      )}
    </section>
  )
}
