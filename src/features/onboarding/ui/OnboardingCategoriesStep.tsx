import { Plus } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import { OnboardingTitle } from './OnboardingTitle'

const EXPENSE_DOT = '#e5533d'
const INCOME_DOT = '#6dbe3a'

export interface CustomCategoryChip {
  name: string
  icon: string
  kind: 'expense' | 'income'
  color: string
}

interface OnboardingCategoriesStepProps {
  templates: readonly CategoryTemplate[]
  selected: readonly string[]
  /** Categories the person created in this step; they are always included. */
  custom: readonly CustomCategoryChip[]
  onToggle: (slug: string) => void
  onToggleAll: () => void
  onCreate: () => void
  onRemoveCustom: (category: CustomCategoryChip) => void
  onContinue: () => void
}

// Screen 011 — Categorías.
export function OnboardingCategoriesStep({
  templates,
  selected,
  custom,
  onToggle,
  onToggleAll,
  onCreate,
  onRemoveCustom,
  onContinue,
}: OnboardingCategoriesStepProps) {
  const allSelected = templates.length > 0 && selected.length === templates.length
  const count = selected.length + custom.length

  return (
    <>
      <OnboardingTitle title="Elegí tus categorías" />
      <p className="mt-3 text-center text-[16px] leading-6 text-text-muted-on-dark">
        Podés crear las tuyas ahora o después desde <em>Más › Categorías</em>.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
          className="min-h-11 whitespace-nowrap rounded-full border-2 border-lime/30 px-4 text-[15px] font-extrabold text-cream"
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
        {custom.map((category) => (
          <CategoryChip
            key={`${category.kind}-${category.name}`}
            surface="dark"
            label={category.name}
            icon={getCategoryIcon(category.icon)}
            dot={category.kind === 'expense' ? EXPENSE_DOT : INCOME_DOT}
            selected
            aria-label={`${category.name} (creada por vos, tocá para quitarla)`}
            onClick={() => onRemoveCustom(category)}
          />
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-lime/40 px-4 font-display text-base font-extrabold text-cream"
        >
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.25} />
          Crear
        </button>
      </div>

      <div className="mt-auto pt-6">
        {count === 0 && (
          <p role="alert" className="mb-3 text-center text-sm text-blush">
            Elegí al menos una categoría para seguir.
          </p>
        )}
        <Button onClick={onContinue} disabled={count === 0}>
          {`Continuar · ${count} ${count === 1 ? 'elegida' : 'elegidas'}`}
        </Button>
      </div>
    </>
  )
}
