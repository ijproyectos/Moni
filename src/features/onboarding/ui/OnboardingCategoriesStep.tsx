import { Plus } from 'lucide-react'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import { OnboardingTitle } from './OnboardingTitle'
import { SkipAllLink } from './SkipAllLink'

const EXPENSE_DOT = '#b23b2e'
const INCOME_DOT = '#5fae4e'

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
  /** Keeps the suggested categories and goes on. */
  onSkip: () => void
  /** Asks to finish the whole onboarding with the defaults. */
  onSkipAll: () => void
  isBusy?: boolean
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
  onSkip,
  onSkipAll,
  isBusy = false,
}: OnboardingCategoriesStepProps) {
  const allSelected = templates.length > 0 && selected.length === templates.length
  const count = selected.length + custom.length

  return (
    <>
      <OnboardingTitle title="Elegí tus categorías" />
      <p className="mt-3 text-center text-[15px] leading-[22px] text-text-muted">
        Podés crear las tuyas ahora o después desde <em>Más › Categorías</em>.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <ul
          className="flex items-center gap-4 text-[15px] font-bold text-text-muted"
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
          className="min-h-11 whitespace-nowrap rounded-full border-2 border-forest px-4 text-[15px] font-extrabold text-ink dark:border-lime"
        >
          {allSelected ? 'Quitar todas' : 'Seleccionar todas'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {templates.map((template) => (
          <CategoryChip
            key={template.slug}
            surface="light"
            label={template.name}
            dot={template.kind === 'expense' ? EXPENSE_DOT : INCOME_DOT}
            selected={selected.includes(template.slug)}
            onClick={() => onToggle(template.slug)}
          />
        ))}
        {custom.map((category) => (
          <CategoryChip
            key={`${category.kind}-${category.name}`}
            surface="light"
            label={category.name}
            dot={category.kind === 'expense' ? EXPENSE_DOT : INCOME_DOT}
            selected
            aria-label={`${category.name} (creada por vos, tocá para quitarla)`}
            onClick={() => onRemoveCustom(category)}
          />
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-line px-4 font-display text-base font-extrabold text-text-muted"
        >
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.25} />
          Crear
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pt-6">
        {count === 0 && (
          <p role="alert" className="mb-3 w-full text-center text-sm font-bold text-expense">
            Elegí al menos una categoría para seguir.
          </p>
        )}
        <Button onClick={onContinue} disabled={count === 0}>
          {`Continuar · ${count} ${count === 1 ? 'elegida' : 'elegidas'}`}
        </Button>
        <Button variant="ghost" disabled={isBusy} onClick={onSkip} className="text-text-muted">
          Saltar
        </Button>
        <SkipAllLink disabled={isBusy} onClick={onSkipAll} />
      </div>
    </>
  )
}
