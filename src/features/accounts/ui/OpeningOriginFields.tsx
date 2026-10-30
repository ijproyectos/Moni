import type { Category } from '@/features/categories/domain/category'
import { cn } from '@/shared/ui/cn'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import {
  findSalaryCategory,
  OPENING_SOURCE_OPTIONS,
  withSource,
  type OpeningOrigin,
  type OpeningSource,
} from '../domain/openingOrigin'

const labelClass = 'text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted'

interface OpeningOriginFieldsProps {
  value: OpeningOrigin
  onChange: (value: OpeningOrigin) => void
  /** The person's income categories. */
  categories: readonly Category[]
  error?: string | null
}

/**
 * "¿De dónde viene esta plata?": dinero que ya tenía (default), mi sueldo or otro ingreso. The last two
 * are real incomes, so they also ask for the day they were received (and a category for "otro ingreso").
 */
export function OpeningOriginFields({
  value,
  onChange,
  categories,
  error,
}: OpeningOriginFieldsProps) {
  const incomeCategories = categories.filter((c) => c.kind === 'income' && c.archivedAt === null)
  const salary = findSalaryCategory(incomeCategories)
  // "Mi sueldo" uses the Sueldo category; without one the person picks, like in "Otro ingreso".
  const askCategory = value.source === 'other' || (value.source === 'salary' && !salary)

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={cn(labelClass, 'mb-2')}>¿De dónde viene esta plata?</legend>
      <div
        role="radiogroup"
        aria-label="¿De dónde viene esta plata?"
        className="flex flex-col gap-2"
      >
        {OPENING_SOURCE_OPTIONS.map((option) => {
          const selected = option.value === value.source
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                onChange(withSource(value, option.value as OpeningSource, incomeCategories))
              }
              className={cn(
                'flex min-h-14 w-full flex-col justify-center rounded-[18px] border-2 px-4 py-2 text-left transition',
                selected
                  ? 'border-transparent bg-forest text-cream'
                  : 'border-cream bg-card text-ink',
              )}
            >
              <span className="font-display text-[17px] font-extrabold leading-5">
                {option.label}
              </span>
              <span
                className={cn(
                  'text-[14px] leading-5',
                  selected ? 'text-text-muted-on-dark' : 'text-text-muted',
                )}
              >
                {option.hint}
              </span>
            </button>
          )
        })}
      </div>

      {value.source !== 'previous' && (
        <>
          {askCategory && (
            <div>
              <span className={labelClass}>Categoría</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {incomeCategories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    icon={getCategoryIcon(c.icon)}
                    color={c.color}
                    selected={value.categoryId === c.id}
                    onClick={() => onChange({ ...value, categoryId: c.id })}
                  />
                ))}
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Fecha del ingreso</span>
            <input
              type="date"
              value={value.occurredOn}
              onChange={(e) => onChange({ ...value, occurredOn: e.target.value })}
              className="h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink"
            />
          </label>
          <p className="text-[14px] leading-5 text-text-muted">
            Cuenta como ingreso del mes de esa fecha y aparece en Actividad.
          </p>
        </>
      )}
      {value.source === 'previous' && (
        <p className="text-[14px] leading-5 text-text-muted">
          Aparece en Actividad como «Saldo inicial». No cuenta como ingreso del mes.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-expense">
          {error}
        </p>
      )}
    </fieldset>
  )
}
