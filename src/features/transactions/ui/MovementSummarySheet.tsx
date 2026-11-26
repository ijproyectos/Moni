import { Pencil, Trash2, Users } from 'lucide-react'
import { Link } from 'react-router'
import type { Category } from '@/features/categories/domain/category'
import { useGroupLedger } from '@/features/groups/api/useGroupLedger'
import { formatLongDay } from '@/shared/lib/dates'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { addsToBalance, groupKindLabel, isAdjustment, isOpening, type Transaction } from '../domain/transaction'

interface MovementSummarySheetProps {
  transaction: Transaction
  category: Category | undefined
  accountName: string | undefined
  /** Name of the group when the movement belongs to one. */
  groupName: string | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

/** Ingreso, gasto, transferencia… in the words the person knows; only what the movement really is. */
function typeLabel(kind: string): string {
  if (kind === 'income' || kind === 'opening_in') return kind === 'income' ? 'Ingreso' : 'Saldo inicial'
  if (kind === 'expense') return 'Gasto'
  if (kind === 'transfer_in' || kind === 'transfer_out') return 'Transferencia'
  if (kind === 'adjustment_in' || kind === 'adjustment_out') return 'Ajuste de saldo'
  return groupKindLabel(kind) ?? 'Movimiento'
}

/**
 * What a movement is, in a bottom sheet over Inicio: amount and type, category, date, account, note, and for a group expense the
 * group with who took part and how much each one owes. Only data that exists is shown. Editing and deleting reuse the existing flows;
 * the records that belong to a group (expense, payment, collection) are managed from the group, where its rules and permissions live.
 */
export function MovementSummarySheet({ transaction, category, accountName, groupName, onClose, onEdit, onDelete }: MovementSummarySheetProps) {
  const income = addsToBalance(transaction.kind)
  const adjustment = isAdjustment(transaction.kind) || isOpening(transaction.kind)
  const groupLabel = groupKindLabel(transaction.kind)
  const categoryName = isOpening(transaction.kind)
    ? 'Saldo inicial'
    : adjustment
      ? 'Ajuste de saldo'
      : (category?.name ?? null)
  const note = transaction.note?.trim() || null
  const title = note ?? groupLabel ?? categoryName ?? typeLabel(transaction.kind)
  const Icon = getCategoryIcon(adjustment ? null : category?.icon)
  const editable = (transaction.kind === 'expense' || transaction.kind === 'income') && transaction.installmentPlanId === null && transaction.accountId !== null
  const deletable = !isOpening(transaction.kind) && !groupLabel
  const groupId = transaction.groupId ?? null

  const rows: [string, string][] = [['Fecha', formatLongDay(transaction.occurredOn)]]
  if (accountName) rows.push(['Medio de pago', accountName])
  if (transaction.funding === 'savings') rows.push(['Origen', 'Ahorros'])
  if (categoryName && !adjustment) rows.push(['Categoría', categoryName])
  if (note && title !== note) rows.push(['Nota', note])
  if (groupName) rows.push(['Grupo', groupName])
  if (transaction.installmentNumber !== null && transaction.installmentsTotal !== null) {
    rows.push(['Cuota', `${transaction.installmentNumber} de ${transaction.installmentsTotal}`])
  }
  if (transaction.kind === 'settlement_out' || transaction.kind === 'settlement_in') rows.push(['Estado', 'Registrado'])

  return (
    <BottomSheet title="Resumen del movimiento" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand text-ink">
            <Icon className="size-6" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-extrabold">{title}</p>
            <p className="text-[13px] font-bold text-text-muted">{typeLabel(transaction.kind)}</p>
          </div>
          <AmountDisplay
            cents={income ? transaction.amountCents : -transaction.amountCents}
            signed
            className={cn('whitespace-nowrap text-[24px] font-extrabold tracking-[-0.02em]', income ? 'text-income' : 'text-ink')}
          />
        </div>

        <dl className="rounded-[22px] bg-card px-4 py-0.5">
          {rows.map(([label, value], index) => (
            <div key={label} className={cn('flex justify-between gap-3 py-2.5 text-[14.5px]', index < rows.length - 1 && 'border-b border-line')}>
              <dt className="text-text-muted">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {groupId && transaction.sharedExpenseId && <SharedBreakdown groupId={groupId} expenseId={transaction.sharedExpenseId} />}

        <div className="flex flex-col gap-2 pt-1">
          {groupId && groupLabel && (
            <Link to={`/grupos/${groupId}`} onClick={onClose} className={cn('flex h-12 items-center justify-center gap-2 rounded-full bg-sand text-[15px] font-extrabold', FOCUS_RING)}>
              <Users aria-hidden="true" className="size-[18px]" strokeWidth={2} />
              Ver en el grupo
            </Link>
          )}
          {editable && (
            <button type="button" onClick={onEdit} className={cn('flex h-12 items-center justify-center gap-2 rounded-full bg-forest text-[15px] font-extrabold text-cream', FOCUS_RING)}>
              <Pencil aria-hidden="true" className="size-[18px]" strokeWidth={2} />
              Editar
            </button>
          )}
          {deletable && (
            <button type="button" onClick={onDelete} className={cn('flex h-12 items-center justify-center gap-2 rounded-full bg-tint-red text-[15px] font-extrabold text-bad-ink', FOCUS_RING)}>
              <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.9} />
              Eliminar
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

/** Who took part in a group expense and what each one owes, from the group's own data. Nothing when it is not found. */
function SharedBreakdown({ groupId, expenseId }: { groupId: string; expenseId: string }) {
  const { ledger } = useGroupLedger(groupId)
  const expense = ledger.expenses.find((e) => e.id === expenseId)
  if (!expense) return null
  const name = (id: string) => ledger.people.find((p) => p.id === id)?.name ?? 'Alguien'
  const payers = expense.payers.map((p) => name(p.personId)).join(', ')
  return (
    <section aria-label="División del gasto" className="rounded-[22px] bg-card px-4 py-3">
      <p className="text-[13px] font-bold text-text-muted">
        Pagó {payers} · {expense.methodLabel}
      </p>
      <ul className="mt-1.5 flex flex-col">
        {expense.shares.map((s) => (
          <li key={s.personId} className="flex justify-between gap-3 py-1 text-[14.5px]">
            <span>{name(s.personId)}</span>
            <AmountDisplay cents={s.cents} className="font-medium" />
          </li>
        ))}
      </ul>
    </section>
  )
}
