import { AlertTriangle } from 'lucide-react'
import { formatCompactDate } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { cn } from '@/shared/ui/cn'
import type { FixedExpense, Occurrence, Payment } from '../domain/fixedExpense'
import { KindTile } from './KindTile'

/**
 * One line of the payment history: what was really paid and when (the due date and the estimate shown apart), or a
 * skipped bill. The actions (correct / undo) only appear in the detail of the fixed expense.
 */
export function PaymentRow({
  payment,
  occurrence,
  expense,
  onCorrect,
  onVoid,
  onOpen,
}: {
  payment: Payment
  occurrence: Occurrence | undefined
  expense: FixedExpense
  /** Present only in the detail. */
  onCorrect?: (payment: Payment) => void
  onVoid?: (payment: Payment) => void
  onOpen?: () => void
}) {
  const voided = payment.status === 'voided'
  const stands = payment.status === 'posted' && !payment.voidedElsewhere
  const status = voided
    ? 'Pago anulado'
    : payment.voidedElsewhere
      ? 'Anulado en Movimientos'
      : 'Pagado'
  const body = (
    <>
      <KindTile kindId={expense.kindId} size="sm" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[17px] font-extrabold">{expense.name}</span>
        <span className="block text-[14px] leading-5 text-text-muted">
          Pagado el {formatCompactDate(payment.paidOn)}
          {occurrence && ` · vencía el ${formatCompactDate(occurrence.dueOn)}`}
        </span>
        <span className="block text-[14px] leading-5 text-text-muted">{payment.accountName}</span>
      </span>
      <span className="text-right">
        <span
          className={cn(
            'block text-[17px] font-extrabold',
            !stands && 'text-text-muted line-through',
          )}
        >
          {formatArs(payment.amountCents)}
        </span>
        <span className="block text-[13px] text-text-muted">{status}</span>
        {occurrence && stands && occurrence.expectedCents !== payment.amountCents && (
          <span className="block text-[13px] text-text-muted">
            Estimado {formatArs(occurrence.expectedCents)}
          </span>
        )}
      </span>
    </>
  )
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${expense.name}, ${status}`}
          className="flex items-center gap-3"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3">{body}</div>
      )}
      {payment.voidedElsewhere && payment.status === 'posted' && (
        <div
          role="alert"
          className="flex gap-2 rounded-[14px] bg-blush/60 p-3 text-[14px] leading-5"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-expense" />
          <span>
            El gasto se anuló desde Movimientos, pero el vencimiento figura pagado. Volvelo a
            pendiente para registrarlo de nuevo.
          </span>
        </div>
      )}
      {onVoid && payment.status === 'posted' && (
        <div className="flex gap-4">
          {onCorrect && stands && payment.source === 'registered' && (
            <button
              type="button"
              onClick={() => onCorrect(payment)}
              aria-label={`Corregir pago de ${expense.name} del ${formatCompactDate(payment.paidOn)}`}
              className="text-[14px] font-extrabold text-ink underline"
            >
              Corregir
            </button>
          )}
          <button
            type="button"
            onClick={() => onVoid(payment)}
            aria-label={`${payment.voidedElsewhere ? 'Volver a pendiente' : 'Anular pago'} de ${expense.name} del ${formatCompactDate(payment.paidOn)}`}
            className="text-[14px] font-extrabold text-expense underline"
          >
            {payment.voidedElsewhere ? 'Volver a pendiente' : 'Anular pago'}
          </button>
        </div>
      )}
    </li>
  )
}

export function SkippedRow({
  occurrence,
  expense,
  onOpen,
}: {
  occurrence: Occurrence
  expense: FixedExpense
  onOpen?: () => void
}) {
  const body = (
    <>
      <KindTile kindId={expense.kindId} size="sm" className="opacity-60" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[17px] font-extrabold">{expense.name}</span>
        <span className="block text-[14px] leading-5 text-text-muted">
          Vencía el {formatCompactDate(occurrence.dueOn)}
          {occurrence.note ? ` · ${occurrence.note}` : ''}
        </span>
      </span>
      <span className="text-right text-[13px] text-text-muted">Omitido</span>
    </>
  )
  return (
    <li className="px-4 py-3">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${expense.name}, omitido`}
          className="flex w-full items-center gap-3"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3">{body}</div>
      )}
    </li>
  )
}
