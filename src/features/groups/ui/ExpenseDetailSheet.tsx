import { Pencil, Trash2, X } from 'lucide-react'
import { formatLongDay } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { cn } from '@/shared/ui/cn'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Avatar, SectionLabel } from '@/shared/ui/kit'
import { personName, type LedgerExpense, type Person } from '../domain/ledger'

interface ExpenseDetailSheetProps {
  expense: LedgerExpense
  people: readonly Person[]
  icon: React.ComponentType<{ className?: string }>
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

// Screen 090 — Detalle del gasto.
export function ExpenseDetailSheet({
  expense,
  people,
  icon: Icon,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: ExpenseDetailSheetProps) {
  const payer =
    expense.payers.length > 1 ? 'varios' : personName(people, expense.payers[0]?.personId ?? '')
  return (
    <BottomSheet title={expense.description} onClose={onClose}>
      <div className="-mt-2 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-full bg-lime/35">
            <Icon className="size-6" />
          </span>
          <p className="text-[16px] text-text-muted">{formatLongDay(expense.occurredOn)}</p>
        </div>
        <p className="font-display text-[44px] font-extrabold leading-[50px]">
          {formatArs(expense.amountCents)}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-[16px]">
          {expense.payers.length === 1 && <Avatar name={payer} size="sm" />}
          Pagó <strong className="font-extrabold">{payer}</strong> ·{' '}
          {expense.methodLabel.startsWith('entre')
            ? `partes iguales ${expense.methodLabel}`
            : expense.methodLabel}
        </p>
        <p className="-mt-2 text-[14px] text-text-muted">
          Cargado por{' '}
          {expense.createdBy ? personName(people, expense.createdBy) : 'alguien del grupo'}
          {expense.source === 'sim' && ' · guardado en este dispositivo'}
        </p>
        <SectionLabel>Cómo se dividió</SectionLabel>
        <ul className="divide-y divide-sand rounded-[22px] border border-sand bg-white px-4">
          {expense.shares.map((s) => {
            const person = people.find((p) => p.id === s.personId)
            const paid = expense.payers.find((p) => p.personId === s.personId)?.cents
            return (
              <li key={s.personId} className="flex items-center gap-3 py-2.5">
                <Avatar name={person?.name ?? '?'} size="sm" />
                <span className="flex-1 text-[18px] font-extrabold">
                  {person?.name ?? 'Ex miembro'}
                </span>
                {paid ? (
                  <span className="text-[14px] text-text-muted">puso {formatArs(paid)}</span>
                ) : person && !person.hasMoni ? (
                  <span className="text-[14px] text-text-muted">sin Moni</span>
                ) : null}
                <span className="w-24 text-right text-[18px] font-extrabold">
                  {formatArs(s.cents)}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="mt-1 grid grid-cols-[1fr_1.4fr] gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={!canEdit}
            className="flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[18px] font-extrabold text-expense disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="size-5" /> Eliminar
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={!canEdit}
            className={cn(
              'flex min-h-14 items-center justify-center gap-2 rounded-full bg-lime text-[18px] font-extrabold disabled:opacity-50',
            )}
          >
            <Pencil aria-hidden="true" className="size-5" /> Editar
          </button>
        </div>
        {!canEdit && (
          <p className="flex items-center gap-1 text-[14px] text-text-muted">
            <X aria-hidden="true" className="size-4" /> Solo quien lo cargó, pagó o participa puede
            cambiarlo.
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
