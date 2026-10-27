import { useState } from 'react'
import { formatLongDay } from '@/shared/lib/dates'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import type { GroupMember, SharedExpense } from '../domain/group'
import { canVoidExpense, nameById } from '../domain/groupView'

interface ExpenseDetailSheetProps {
  expense: SharedExpense
  members: readonly GroupMember[]
  template?: CategoryTemplate
  meId: string
  isVoiding: boolean
  voidError: string | null
  onVoid: () => void
  onClose: () => void
}

/** Detail of a shared expense: who paid, each split and, when allowed, void (behind a confirm). */
export function ExpenseDetailSheet({
  expense,
  members,
  template,
  meId,
  isVoiding,
  voidError,
  onVoid,
  onClose,
}: ExpenseDetailSheetProps) {
  const [confirming, setConfirming] = useState(false)
  const voided = expense.status === 'voided'

  if (confirming) {
    return (
      <ConfirmDialog
        title="¿Anular este gasto?"
        message="Se borra de los saldos del grupo y de tus gastos. Si pagaste desde una cuenta, también se devuelve la plata."
        confirmLabel="Anular gasto"
        isBusy={isVoiding}
        onConfirm={onVoid}
        onCancel={() => setConfirming(false)}
      />
    )
  }

  return (
    <BottomSheet title={expense.description} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <AmountDisplay cents={expense.amountCents} className="font-display text-4xl font-bold" />
          <p className="text-[15px] text-text-muted">
            Pagó {nameById(members, expense.paidBy, meId)} · {formatLongDay(expense.occurredOn)}
            {template ? ` · ${template.name}` : ''}
          </p>
          {voided && <p className="mt-1 font-semibold text-expense">Anulado</p>}
        </div>

        <section aria-labelledby="splits-title">
          <h3
            id="splits-title"
            className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-text-muted"
          >
            {expense.splitMethod === 'percent' ? 'Por porcentaje' : 'Partes iguales'}
          </h3>
          <ul className="divide-y divide-cream rounded-xl border border-cream bg-white">
            {expense.splits.map((split) => (
              <li key={split.userId} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">
                  {nameById(members, split.userId, meId)}
                </span>
                {split.percent !== null && (
                  <span className="text-sm text-text-muted">
                    {String(split.percent).replace('.', ',')}%
                  </span>
                )}
                <AmountDisplay cents={split.shareCents} className="font-display font-semibold" />
              </li>
            ))}
          </ul>
        </section>

        {voidError && (
          <p role="alert" className="text-center text-sm text-expense">
            {voidError}
          </p>
        )}
        {canVoidExpense(expense, meId) && (
          <Button variant="dark" onClick={() => setConfirming(true)}>
            Anular gasto
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}
