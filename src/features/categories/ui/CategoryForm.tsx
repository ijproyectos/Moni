import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
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
  onArchive?: () => void
  /** Extra fields shown before the save button (e.g. the simulated monthly limit). */
  children?: ReactNode
}

export function CategoryForm({
  kind,
  initial,
  validateName,
  isSubmitting,
  submitError,
  onSubmit,
  onArchive,
  children,
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
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
          Nombre
        </span>
        <label className="flex flex-1 flex-col gap-1">
          <span className="sr-only">Nombre</span>
          <input
            type="text"
            data-autofocus
            maxLength={40}
            placeholder="Nombre de la categoría"
            aria-label="Nombre"
            aria-invalid={Boolean(errors.name) || undefined}
            className="h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink placeholder:text-text-muted"
            {...register('name')}
          />
        </label>
      </div>
      {errors.name && (
        <p role="alert" className="-mt-2 text-sm text-expense">
          {errors.name.message}
        </p>
      )}

      {/* min-w-0: a fieldset defaults to min-width: min-content and would grow to fit every option. */}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
          Ícono
        </legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] justify-items-center gap-2">
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
                  'flex aspect-square w-full max-w-12 items-center justify-center rounded-[16px] border-2',
                  selected ? 'border-ink bg-forest text-lime' : 'border-sand bg-card text-ink',
                )}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
          Color
        </legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] justify-items-center gap-x-2 gap-y-3 p-1">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              aria-label={`Color ${c}`}
              onClick={() => setValue('color', c)}
              className={cn(
                'flex aspect-square w-full max-w-11 items-center justify-center rounded-full',
                color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-canvas',
              )}
              style={{ backgroundColor: c, color: readableOn(c) }}
            >
              {color === c && <Check aria-hidden="true" className="size-5" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </fieldset>

      {children}

      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
      {onArchive && (
        <Button variant="ghost" onClick={onArchive} className="text-expense">
          Eliminar categoría
        </Button>
      )}
    </form>
  )
}
