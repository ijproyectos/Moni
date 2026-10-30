import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useBudgetSuggestions, useCreateBudget } from '../api/useBudgets'
import type { BudgetSuggestion } from '../domain/budget'

/** "Sugerencias" for the categories screen: one tap creates the limit. Hidden while empty or on error. */
export function BudgetSuggestions() {
  const suggestions = useBudgetSuggestions()
  const create = useCreateBudget()
  const toast = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const list = suggestions.data ?? []
  if (list.length === 0) return null

  async function use(s: BudgetSuggestion) {
    setPendingId(s.categoryId)
    try {
      await create.mutateAsync({ categoryId: s.categoryId, amountCents: s.suggestedCents })
      toast.show(`Límite de ${formatArs(s.suggestedCents)} para ${s.name}`)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section aria-labelledby="suggestions-title" className="flex flex-col gap-2">
      <SectionLabel>
        <span id="suggestions-title">Sugerencias</span>
      </SectionLabel>
      <p className="px-1 text-[15px] leading-5 text-text-muted">
        Según lo que gastaste en los últimos 3 meses. Podés cambiarlo cuando quieras.
      </p>
      <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
        {list.map((s) => (
          <li key={s.categoryId} className="flex items-center gap-3 px-4 py-3">
            <CategoryIconCircle iconName={s.icon} color={s.color} className="size-12" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-extrabold">{s.name}</span>
              <span className="block text-[14px] text-text-muted">
                {formatArs(s.suggestedCents)} por mes · {s.monthsWithData} de 3 meses con gastos
              </span>
            </span>
            <button
              type="button"
              disabled={pendingId !== null}
              onClick={() => void use(s)}
              aria-label={`Usar sugerencia para ${s.name}`}
              className="min-h-11 rounded-full bg-lime px-4 text-[15px] font-extrabold text-forest disabled:opacity-60"
            >
              Usar sugerencia
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
