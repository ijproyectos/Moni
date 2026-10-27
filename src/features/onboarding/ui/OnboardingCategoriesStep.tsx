import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import type { CategoryTemplate } from '@/features/categories/domain/category'

const EXPENSE_DOT = '#e5533d'
const INCOME_DOT = '#6dbe3a'

interface OnboardingCategoriesStepProps {
  templates: readonly CategoryTemplate[]
  selected: readonly string[]
  onToggle: (slug: string) => void
  onToggleAll: () => void
  onFinish: () => void
  isSaving: boolean
  error: string | null
}

// Screen 05 — Categorías. Custom categories live in Más > Categorías, so there is no "Crear" chip here.
export function OnboardingCategoriesStep({
  templates,
  selected,
  onToggle,
  onToggleAll,
  onFinish,
  isSaving,
  error,
}: OnboardingCategoriesStepProps) {
  const allSelected = templates.length > 0 && selected.length === templates.length
  const count = selected.length

  return (
    <>
      <h1 className="mt-10 text-center font-display text-[32px] font-semibold leading-9 text-cream">
        Elegí tus categorías
      </h1>
      <p className="mt-3 text-center text-[17px] leading-6 text-text-muted-on-dark">
        Podés crear las tuyas después desde <em>Más › Categorías</em>.
      </p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <ul
          className="flex items-center gap-4 text-[15px] text-text-muted-on-dark"
          aria-label="Referencias"
        >
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: EXPENSE_DOT }}
            />
            Gastos
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: INCOME_DOT }}
            />
            Ingresos
          </li>
        </ul>
        <button
          type="button"
          onClick={onToggleAll}
          className="min-h-11 rounded-full border-2 border-lime/30 px-4 font-display text-[15px] font-semibold text-cream"
        >
          {allSelected ? 'Quitar todas' : 'Seleccionar todas'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {templates.map((template) => (
          <CategoryChip
            key={template.slug}
            surface="dark"
            label={template.name}
            icon={getCategoryIcon(template.icon)}
            dot={template.kind === 'expense' ? EXPENSE_DOT : INCOME_DOT}
            selected={selected.includes(template.slug)}
            onClick={() => onToggle(template.slug)}
          />
        ))}
      </div>

      <div className="mt-auto pt-6">
        {error && (
          <p role="alert" className="mb-3 text-center text-sm text-blush">
            {error}
          </p>
        )}
        <Button onClick={onFinish} disabled={count === 0 || isSaving}>
          {isSaving ? 'Guardando…' : `Continuar · ${count} ${count === 1 ? 'elegida' : 'elegidas'}`}
        </Button>
      </div>
    </>
  )
}
