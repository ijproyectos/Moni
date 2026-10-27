import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import {
  GROUP_KIND_LABELS,
  GROUP_KINDS,
  groupFormSchema,
  type GroupFormInput,
  type GroupFormValues,
} from '../domain/group'
import { GROUP_KIND_ICONS } from './groupKindIcons'
import { fieldClass, labelClass } from './styles'

interface GroupFormProps {
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: GroupFormValues) => void
}

/** Nuevo grupo form (screen 14): name and a 2x2 kind grid. */
export function GroupForm({ isSubmitting, submitError, onSubmit }: GroupFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<GroupFormInput, unknown, GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { name: '', kind: 'casa' },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div>
        <input
          type="text"
          aria-label="Nombre del grupo"
          placeholder="Nombre del grupo"
          maxLength={60}
          autoComplete="off"
          aria-invalid={Boolean(errors.name) || undefined}
          className={fieldClass}
          data-autofocus
          {...register('name')}
        />
        {errors.name && (
          <p role="alert" className="mt-1 px-2 text-sm text-expense">
            {errors.name.message}
          </p>
        )}
      </div>

      <fieldset>
        <legend className={cn(labelClass, 'mb-2')}>Tipo</legend>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-3">
              {GROUP_KINDS.map((kind) => {
                const Icon = GROUP_KIND_ICONS[kind]
                const selected = field.value === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => field.onChange(kind)}
                    className={cn(
                      'flex h-14 items-center justify-center gap-2 rounded-full border font-display text-[17px] font-semibold transition',
                      selected
                        ? 'border-transparent bg-forest text-cream'
                        : 'border-cream bg-white text-forest',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
                    {GROUP_KIND_LABELS[kind]}
                  </button>
                )
              })}
            </div>
          )}
        />
        {errors.kind && (
          <p role="alert" className="mt-2 text-sm text-expense">
            {errors.kind.message}
          </p>
        )}
      </fieldset>

      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creando…' : 'Crear grupo'}
      </Button>
    </form>
  )
}
