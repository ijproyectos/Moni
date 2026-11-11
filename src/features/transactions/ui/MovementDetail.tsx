import { ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import type { Category } from '@/features/categories/domain/category'
import { formatDayMonth, formatLongDay, formatRelativeDay } from '@/shared/lib/dates'
import type { IsoDate } from '@/shared/lib/month'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { categoryWeekInsight } from '../domain/movementInsight'
import {
  addsToBalance,
  isAdjustment,
  isOpening,
  type Transaction,
} from '../domain/transaction'

interface MovementDetailProps {
  transaction: Transaction
  category: Category | undefined
  /** Name of the account the movement was charged to, when known. */
  accountName: string | undefined
  /** Every movement, to derive the "dato de Moni" from real history. */
  history: readonly Transaction[]
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

function localDate(iso: string): IsoDate {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${String(d.getDate()).padStart(2, '0')}`
}

function localTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The time of day is only known when the movement was loaded the day it happened. */
function timeOf(tx: Transaction): string | null {
  return Number.isNaN(new Date(tx.createdAt).getTime()) || localDate(tx.createdAt) !== tx.occurredOn
    ? null
    : localTime(tx.createdAt)
}

const HEADER_BUTTON = cn(
  'flex size-11 items-center justify-center rounded-full bg-card text-ink',
  FOCUS_RING,
)

/**
 * "Detalle" of one movement: amount first, then its facts. Only what the app really stores is shown (no voice
 * transcript, no "cargado por voz"). Editing and deleting reuse the existing flows.
 */
export function MovementDetail({
  transaction,
  category,
  accountName,
  history,
  onClose,
  onEdit,
  onDelete,
}: MovementDetailProps) {
  const today = todayIso()
  const income = addsToBalance(transaction.kind)
  const adjustment = isAdjustment(transaction.kind) || isOpening(transaction.kind)
  const categoryName = isOpening(transaction.kind)
    ? 'Saldo inicial'
    : adjustment
      ? 'Ajuste de saldo'
      : (category?.name ?? 'Sin categoría')
  const name = transaction.note?.trim() || categoryName
  const time = timeOf(transaction)
  const Icon = getCategoryIcon(adjustment ? null : category?.icon)
  const editable =
    (transaction.kind === 'expense' || transaction.kind === 'income') &&
    transaction.installmentPlanId === null
  const insight = categoryWeekInsight(transaction, history)
  const insightName = categoryName.toLowerCase()
  const installment =
    transaction.installmentNumber !== null && transaction.installmentsTotal !== null
      ? `${transaction.installmentNumber} de ${transaction.installmentsTotal}`
      : null
  const loadedOn = localDate(transaction.createdAt)
  const rows: [string, string][] = [
    ['Fecha', `${formatLongDay(transaction.occurredOn)}${time ? `, ${time}` : ''}`],
  ]
  if (accountName) rows.push(['Medio de pago', accountName])
  rows.push(['Categoría', categoryName])
  if (installment) rows.push(['Cuota', installment])
  if (transaction.statementClosingOn)
    rows.push(['Entra en el resumen', `cierra el ${formatDayMonth(transaction.statementClosingOn)}`])
  if (!Number.isNaN(new Date(transaction.createdAt).getTime()))
    rows.push(['Cargado', formatRelativeDay(loadedOn, today)])

  return (
    <BottomSheet title="Detalle del movimiento" variant="screen" bare onClose={onClose}>
      <div className="grid shrink-0 grid-cols-[44px_1fr_44px] items-center">
        <button type="button" onClick={onClose} aria-label="Volver" className={HEADER_BUTTON}>
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
        <div className="text-center" aria-hidden="true">
          <div className="font-display text-[20px] font-semibold tracking-[-0.02em]">Detalle</div>
          <div className="text-[12.5px] text-text-muted">
            {formatRelativeDay(transaction.occurredOn, today)}
            {time ? ` · ${time}` : ''}
          </div>
        </div>
        {editable ? (
          <button type="button" onClick={onEdit} aria-label="Editar" className={HEADER_BUTTON}>
            <Pencil aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3">
        <div className="flex flex-col items-center gap-2 pb-1.5 pt-3.5">
          <span
            aria-hidden="true"
            className="flex size-[60px] items-center justify-center rounded-full bg-sand text-ink"
          >
            <Icon className="size-[27px]" strokeWidth={1.9} />
          </span>
          <span className="text-[17px] font-medium">{name}</span>
          <AmountDisplay
            cents={income ? transaction.amountCents : -transaction.amountCents}
            signed
            className={cn(
              'text-[46px] font-bold leading-none tracking-[-0.04em]',
              income ? 'text-income' : 'text-ink',
            )}
          />
          <span className="rounded-full bg-mint-soft px-[9px] py-[3px] text-[12px] font-semibold text-mint-ink">
            {categoryName}
          </span>
        </div>

        <dl className="rounded-[26px] bg-card px-4 py-0.5">
          {rows.map(([label, value], index) => (
            <div
              key={label}
              className={cn(
                'flex justify-between gap-3 py-3 text-[14.5px]',
                index < rows.length - 1 && 'border-b border-line',
              )}
            >
              <dt className="text-text-muted">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {insight && (
          <div className="flex items-center gap-3 rounded-[18px] bg-mint-soft px-3.5 py-3">
            <img src={mascotAnalyst} alt="" className="size-[30px] rounded-full" />
            <p className="text-[13.5px] text-ink">
              {`Es tu ${insight.count}° ${insightName} de la semana. Tu promedio es ${insight.average}.`}
            </p>
          </div>
        )}

        {!isOpening(transaction.kind) && (
          <div className="mt-auto pt-2">
            <button
              type="button"
              onClick={onDelete}
              className={cn(
                'flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-tint-red text-[15px] font-semibold text-bad-ink',
                FOCUS_RING,
              )}
            >
              <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.9} />
              Eliminar
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
