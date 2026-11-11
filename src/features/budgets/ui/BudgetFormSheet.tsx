import { useState } from 'react'
import { useCategories } from '@/features/categories/api/useCategories'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { useToast } from '@/shared/ui/toastContext'
import { useArchiveBudget, useCreateBudget, useUpdateBudget } from '../api/useBudgets'
import { parseBudgetLimit, type BudgetStatus } from '../domain/budget'

interface BudgetFormSheetProps {
  /** Present to edit that category's limit; absent to add a limit to a category that has none. */
  budget?: BudgetStatus
  /** Categories that already have a limit (they cannot be chosen again). */
  takenCategoryIds: ReadonlySet<string>
  onClose: () => void
}

/** Adds, changes or removes the monthly limit of an expense category (the same limits as the category form). */
export function BudgetFormSheet({ budget, takenCategoryIds, onClose }: BudgetFormSheetProps) {
  const categories = useCategories('expense')
  const create = useCreateBudget()
  const update = useUpdateBudget()
  const archive = useArchiveBudget()
  const toast = useToast()
  const [categoryId, setCategoryId] = useState<string | null>(budget?.categoryId ?? null)
  const [amount, setAmount] = useState(budget ? formatAmountInput(budget.amountCents) : '')
  const [error, setError] = useState<string | null>(null)
  const available = (categories.data ?? []).filter(
    (c) => c.archivedAt === null && !takenCategoryIds.has(c.id),
  )
  const busy = create.isPending || update.isPending || archive.isPending

  async function save() {
    const parsed = parseBudgetLimit(amount)
    if (!parsed.ok || parsed.cents === null) {
      setError('Ingresá un monto mayor a cero.')
      return
    }
    if (!budget && !categoryId) {
      setError('Elegí una categoría.')
      return
    }
    setError(null)
    try {
      if (budget) await update.mutateAsync({ id: budget.budgetId, amountCents: parsed.cents })
      else if (categoryId) await create.mutateAsync({ categoryId, amountCents: parsed.cents })
      toast.show('Presupuesto guardado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  async function remove() {
    if (!budget) return
    try {
      await archive.mutateAsync({ id: budget.budgetId })
      toast.show('Presupuesto quitado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet
      variant="menta"
      title={budget ? `Presupuesto de ${budget.name}` : 'Nuevo presupuesto'}
      subtitle="Cuánto querés gastar por mes en esta categoría"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {!budget &&
          (available.length === 0 && !categories.isLoading ? (
            <p className="text-[14px] text-text-muted">
              Todas tus categorías de gastos ya tienen un presupuesto.
            </p>
          ) : (
            <div role="group" aria-label="Categoría" className="flex flex-wrap gap-2">
              {available.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'rounded-full px-3.5 py-[7px] text-[13.5px] font-medium',
                    FOCUS_RING,
                    categoryId === c.id ? 'bg-ink text-canvas' : 'bg-card text-ink',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))}
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Límite por mes
          </span>
          <AmountInput
            scale="md"
            aria-label="Límite por mes"
            value={amount}
            invalid={error !== null}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-bad-ink">
            {error}
          </p>
        )}
        <Button onClick={() => void save()} disabled={busy}>
          Guardar
        </Button>
        {budget && (
          <Button variant="ghost" onClick={() => void remove()} disabled={busy} className="text-bad-ink">
            Quitar presupuesto
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}
