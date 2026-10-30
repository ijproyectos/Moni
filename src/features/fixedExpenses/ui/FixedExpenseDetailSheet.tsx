import { useState } from 'react'
import { formatCompactDate } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useSetFixedExpenseStatus, useVoidPayment } from '../api/useFixedExpenses'
import {
  historyItems,
  PERIOD_LABELS,
  type FixedExpense,
  type FixedExpenseOverview,
  type Payment,
} from '../domain/fixedExpense'
import { CorrectPaymentSheet } from './CorrectPaymentSheet'
import { PaymentRow, SkippedRow } from './FixedHistoryRow'
import { KindTile } from './KindTile'

const STATUS_LABEL = {
  active: 'Activo',
  paused: 'Pausado',
  removed: 'Seguimiento eliminado',
} as const
const PER = { monthly: 'por mes', bimonthly: 'cada dos meses', yearly: 'por año' } as const

/** Detail of one fixed expense: estimate, next due date, history with correct/undo, and pause / delete the follow-up. */
export function FixedExpenseDetailSheet({
  expense,
  overview,
  onEdit,
  onClose,
}: {
  expense: FixedExpense
  overview: FixedExpenseOverview
  onEdit: () => void
  onClose: () => void
}) {
  const toast = useToast()
  const setStatus = useSetFixedExpenseStatus()
  const voidPayment = useVoidPayment()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [correcting, setCorrecting] = useState<Payment | null>(null)
  const occurrences = new Map(overview.occurrences.map((o) => [o.id, o]))
  const items = historyItems(overview, expense.id)

  async function change(status: 'active' | 'paused' | 'removed', done: string) {
    try {
      await setStatus.mutateAsync({ id: expense.id, status })
      toast.show(done)
      setConfirmRemove(false)
      if (status !== 'active') onClose()
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setConfirmRemove(false)
    }
  }

  async function confirmVoid() {
    if (!voiding) return
    const payment = voiding
    setVoiding(null)
    try {
      await voidPayment.mutateAsync(payment.id)
      toast.show('Pago anulado: el vencimiento volvió a pendiente')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <BottomSheet title={expense.name} subtitle={STATUS_LABEL[expense.status]} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <KindTile kindId={expense.kindId} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[26px] font-extrabold leading-8">
              ≈ {formatArs(expense.amountCents)}
            </span>
            <span className="block text-[15px] leading-5 text-text-muted">
              estimado {PER[expense.period]} · {PERIOD_LABELS[expense.period]} ·{' '}
              {expense.accountName}
            </span>
          </span>
        </div>

        {expense.status === 'active' && (
          <p className="text-[16px] leading-6">
            Próximo vencimiento:{' '}
            <strong className="font-extrabold">{formatCompactDate(expense.nextDueOn)}</strong>
          </p>
        )}
        {expense.status === 'paused' && (
          <p className="text-[15px] leading-5 text-text-muted">
            Pausado: no aparecen vencimientos nuevos y no te recordamos nada. Los que ya estaban
            pendientes se conservan (los ves en Pausados). Al reactivarlo sigue desde el próximo,
            sin sumar los que pasaron mientras tanto.
          </p>
        )}
        {expense.status === 'removed' && (
          <p className="text-[15px] leading-5 text-text-muted">
            Ya no lo seguís en Moni. Los pagos y movimientos que registraste se conservan.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {expense.status !== 'removed' && (
            <Button variant="dark" onClick={onEdit}>
              Editar
            </Button>
          )}
          {expense.status === 'active' && (
            <Button
              variant="ghost"
              className="text-forest"
              disabled={setStatus.isPending}
              onClick={() => void change('paused', `${expense.name} pausado`)}
            >
              Pausar
            </Button>
          )}
          {expense.status !== 'active' && (
            <Button
              variant={expense.status === 'removed' ? 'dark' : 'ghost'}
              className={expense.status === 'removed' ? undefined : 'text-forest'}
              disabled={setStatus.isPending}
              onClick={() => void change('active', `${expense.name} reactivado`)}
            >
              Reactivar
            </Button>
          )}
          {expense.status !== 'removed' && (
            <Button variant="ghost" className="text-expense" onClick={() => setConfirmRemove(true)}>
              Eliminar seguimiento
            </Button>
          )}
        </div>

        <SectionLabel>Historial de pagos</SectionLabel>
        {items.length === 0 ? (
          <p className="text-[15px] text-text-muted">Todavía no registraste pagos.</p>
        ) : (
          <ul className="-mx-4 divide-y divide-sand">
            {items.map((item) =>
              item.type === 'payment' ? (
                <PaymentRow
                  key={item.payment.id}
                  payment={item.payment}
                  occurrence={occurrences.get(item.payment.occurrenceId)}
                  expense={expense}
                  onCorrect={setCorrecting}
                  onVoid={setVoiding}
                />
              ) : (
                <SkippedRow
                  key={item.occurrence.id}
                  occurrence={item.occurrence}
                  expense={expense}
                />
              ),
            )}
          </ul>
        )}
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title={`¿Eliminar el seguimiento de ${expense.name}?`}
          message="Moni deja de mostrarte sus vencimientos y recordatorios. Los pagos y movimientos que ya registraste se conservan y podés volver a activarlo cuando quieras."
          confirmLabel="Eliminar seguimiento"
          cancelLabel="Volver"
          isBusy={setStatus.isPending}
          onConfirm={() => void change('removed', `Seguimiento de ${expense.name} eliminado`)}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
      {voiding && (
        <ConfirmDialog
          title={voiding.voidedElsewhere ? '¿Volver a pendiente?' : '¿Anular este pago?'}
          message={
            voiding.voidedElsewhere
              ? 'El gasto ya estaba anulado en Movimientos. El vencimiento vuelve a quedar pendiente para registrarlo de nuevo.'
              : voiding.source === 'linked'
                ? 'El gasto que cargaste vos no se anula: solo se desvincula de este vencimiento, que vuelve a quedar pendiente. El saldo no cambia.'
                : `Moni anula el gasto de ${formatArs(voiding.amountCents)} del ${formatCompactDate(voiding.paidOn)} y devuelve el importe a la cuenta (o la deuda a la tarjeta). El vencimiento vuelve a quedar pendiente y el pago queda en el historial como anulado.`
          }
          confirmLabel={voiding.voidedElsewhere ? 'Volver a pendiente' : 'Anular pago'}
          cancelLabel="Volver"
          isBusy={voidPayment.isPending}
          onConfirm={() => void confirmVoid()}
          onCancel={() => setVoiding(null)}
        />
      )}
      {correcting && (
        <CorrectPaymentSheet
          payment={correcting}
          expense={expense}
          onClose={() => setCorrecting(null)}
        />
      )}
    </BottomSheet>
  )
}
