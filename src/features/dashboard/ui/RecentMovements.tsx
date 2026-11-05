import { Link } from 'react-router'
import { useState } from 'react'
import { addsToBalance, isAdjustment, isOpening } from '@/features/transactions/domain/transaction'
import { formatDayMonth, formatLongDay } from '@/shared/lib/dates'
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

/** "Movimientos": the newest ones by day, as plain rows. Swiping a row to the left reveals edit and void. */
export function RecentMovements({
  movements,
  total,
  actions,
}: {
  movements: readonly RecentMovement[]
  /** How many movements there are in all (the link to Actividad says it). */
  total?: number
  actions?: MovementActions
}) {
  const [pending, setPending] = useState<RecentMovement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const days = groupMovementsByDay(movements)
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
    <section aria-labelledby="recent-title" className="border-t border-line py-6">
      <div className="mb-3 flex items-baseline justify-between px-5">
        <h2 id="recent-title" className="font-display text-[28px] font-extrabold">
          Movimientos
        </h2>
        <Link to="/actividad" className="flex min-h-11 items-center text-[16px] text-text-muted">
          {total ? `Ver los ${total}` : 'Ver todos'}
        </Link>
      </div>
      {days.map((day) => {
        const net = day.movements.reduce(
          (s, m) => s + (addsToBalance(m.kind) ? m.amountCents : -m.amountCents),
          0,
        )
        return (
          <section key={day.date} aria-label={formatLongDay(day.date)}>
            <div className="flex items-baseline justify-between px-5 pb-2 pt-1 text-[17px] text-text-muted">
              <h3 className="font-medium">
                {formatLongDay(day.date).split(',')[0]} {formatDayMonth(day.date)}
              </h3>
              <AmountDisplay cents={net} signed />
            </div>
            <ul className="divide-y divide-line border-b border-line">
              {day.movements.map((m) => {
                const isIncome = addsToBalance(m.kind)
                const canEdit = actions?.canEdit(m) ?? false
                const canVoid = actions?.canVoid(m) ?? false
                const row = (
                  <div className="flex min-h-[72px] items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[19px] font-semibold leading-6 text-ink">
                        {titleOf(m)}
                      </span>
                      <span className="block truncate text-[15px] leading-5 text-text-muted">
                        {subtitleOf(m)}
                      </span>
                    </span>
                    <AmountDisplay
                      cents={isIncome ? m.amountCents : -m.amountCents}
                      signed
                      className={
                        isAdjustment(m.kind) || isOpening(m.kind)
                          ? 'text-[20px] font-bold text-ink'
                          : `text-[20px] font-bold ${isIncome ? 'text-income' : 'text-expense'}`
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
      {anySwipe && (
        <p className="px-5 pt-4 text-center text-[15px] text-text-muted">
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
