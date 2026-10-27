import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_NAMES,
  DEFAULT_CATEGORY_COLOR,
  getCategoryIcon,
  readableOn,
} from '@/shared/ui/categoryIcons'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { categoryFormSchema, type Category, type CategoryFormValues } from '../domain/category'
import type { CategoryKind } from '@/shared/lib/database.types'

interface CategoryFormProps {
  kind: CategoryKind
  initial?: Category
  /** Returns an error message when the name is already used by another active category. */
  validateName: (name: string) => string | null
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: CategoryFormValues) => void
}

export function CategoryForm({
  kind,
  initial,
  validateName,
  isSubmitting,
  submitError,
  onSubmit,
}: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      kind,
      name: initial?.name ?? '',
      icon: initial?.icon ?? 'Tag',
      color: initial?.color ?? DEFAULT_CATEGORY_COLOR,
    },
  })
  const [icon, color] = [watch('icon'), watch('color')]

  function submit(values: CategoryFormValues) {
    const taken = validateName(values.name)
    if (taken) {
      setError('name', { message: taken })
      return
    }
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CategoryIconCircle iconName={icon} color={color} className="size-14" />
        <label className="flex flex-1 flex-col gap-1">
          <span className="sr-only">Nombre</span>
          <input
            type="text"
            data-autofocus
            maxLength={40}
            placeholder="Nombre de la categoría"
            aria-label="Nombre"
            aria-invalid={Boolean(errors.name) || undefined}
            className="h-14 w-full rounded-full border border-cream bg-white px-5 text-[17px] text-forest placeholder:text-text-muted"
            {...register('name')}
          />
        </label>
      </div>
      {errors.name && (
        <p role="alert" className="-mt-2 text-sm text-expense">
          {errors.name.message}
        </p>
      )}

      <fieldset>
        <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-text-muted">
          Ícono
        </legend>
        <div className="grid grid-cols-6 gap-2">
          {CATEGORY_ICON_NAMES.map((iconName) => {
            const Icon = getCategoryIcon(iconName)
            const selected = icon === iconName
            return (
              <button
                key={iconName}
                type="button"
                aria-pressed={selected}
                aria-label={iconName}
                onClick={() => setValue('icon', iconName)}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border-2',
                  selected
                    ? 'border-forest bg-forest text-cream'
                    : 'border-cream bg-white text-forest',
                )}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-text-muted">
          Color
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              aria-label={`Color ${c}`}
              onClick={() => setValue('color', c)}
              className="flex size-11 items-center justify-center rounded-full"
              style={{ backgroundColor: c, color: readableOn(c) }}
            >
              {color === c && <Check aria-hidden="true" className="size-5" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </fieldset>

      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" variant="dark" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}
