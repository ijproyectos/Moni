import { Tag } from 'lucide-react'
import { useId, type ChangeEvent } from 'react'
import type { Category } from '@/features/categories/domain/category'
import { getCategoryIcon, readableOn } from './categoryIcons'

/** Value of the trailing "create" option; never a real category id. */
const CREATE_VALUE = '__create__'

interface CategorySelectProps {
  categories: readonly Category[]
  /** Selected category id, '' for none. */
  value: string
  onChange: (categoryId: string) => void
  /** Offers a trailing "Nueva categoría" option that calls this instead of selecting. */
  onCreate?: () => void
  invalid?: boolean
  label?: string
}

/**
 * Compact category picker: a native <select> (keyboard and screen reader support for free)
 * with the selected category's icon, in its color, drawn in front of it.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  onCreate,
  invalid = false,
  label = 'Categoría',
}: CategorySelectProps) {
  const id = useId()
  const selected = categories.find((c) => c.id === value)
  const Icon = selected ? getCategoryIcon(selected.icon) : Tag

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    if (event.target.value === CREATE_VALUE) {
      // Keep the current selection: the creation flow sets the new category itself.
      onCreate?.()
      return
    }
    onChange(event.target.value)
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted"
      >
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          data-testid="category-select-icon"
          className="pointer-events-none absolute left-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-sand text-ink"
          style={
            selected ? { backgroundColor: selected.color, color: readableOn(selected.color) } : {}
          }
        >
          <Icon className="size-[18px]" strokeWidth={2} />
        </span>
        <select
          id={id}
          value={value}
          onChange={handleChange}
          aria-invalid={invalid || undefined}
          className="h-14 w-full rounded-[18px] border border-sand bg-card pl-14 pr-4 text-[17px] text-ink"
        >
          <option value="" disabled>
            Elegí una categoría
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {onCreate && <option value={CREATE_VALUE}>+ Nueva categoría</option>}
        </select>
      </div>
    </div>
  )
}
