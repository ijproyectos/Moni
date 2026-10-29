import { zodResolver } from '@hookform/resolvers/zod'
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import {
  ACCOUNT_KIND_SHORT_LABELS,
  ACCOUNT_KINDS,
  accountFormSchema,
  type Account,
  type AccountFormInput,
  type AccountFormValues,
} from '../domain/account'

interface AccountFormProps {
  initial?: Account
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: AccountFormValues) => void
  onArchive?: () => void
  /** Extra fields shown before the save button (e.g. the simulated alias). */
  children?: ReactNode
}

const KIND_OPTIONS = ACCOUNT_KINDS.map((value) => ({
  value,
  label: ACCOUNT_KIND_SHORT_LABELS[value],
}))

export function AccountForm({
  initial,
  isSubmitting,
  submitError,
  onSubmit,
  onArchive,
  children,
}: AccountFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AccountFormInput, unknown, AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      kind: initial?.kind ?? 'cash',
      // A card stores its starting debt as a negative number; the form shows it as a positive debt.
      openingBalance: initial ? formatAmountInput(Math.abs(initial.openingBalanceCents)) : '',
      creditLimit: initial?.creditLimitCents ? formatAmountInput(initial.creditLimitCents) : '',
      closingDay: initial?.closingDay ? String(initial.closingDay) : '',
      dueDay: initial?.dueDay ? String(initial.dueDay) : '',
    },
  })
  const kind = watch('kind')

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
          Nombre
        </span>
        <input
          type="text"
          data-autofocus
          maxLength={40}
          placeholder="Ej: Cuenta sueldo"
          aria-invalid={Boolean(errors.name) || undefined}
          className="h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted"
          {...register('name')}
        />
        {errors.name && (
          <span role="alert" className="text-sm text-expense">
            {errors.name.message}
          </span>
        )}
      </label>

      <SegmentedControl
        label="Tipo de cuenta"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(value) => setValue('kind', value)}
      />

      <div>
        <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
          {kind === 'credit_card' ? 'Deuda inicial' : 'Saldo inicial'}
        </span>
        <AmountInput
          scale="md"
          aria-label={kind === 'credit_card' ? 'Deuda inicial' : 'Saldo inicial'}
          invalid={Boolean(errors.openingBalance)}
          {...register('openingBalance')}
        />
        {errors.openingBalance && (
          <p role="alert" className="mt-1 text-sm text-expense">
            {errors.openingBalance.message}
          </p>
        )}
      </div>

      {kind === 'credit_card' && (
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Límite de crédito
            </span>
            <AmountInput
              scale="md"
              aria-label="Límite de crédito"
              placeholder="Sin límite"
              invalid={Boolean(errors.creditLimit)}
              {...register('creditLimit')}
            />
            {errors.creditLimit && (
              <p role="alert" className="mt-1 text-sm text-expense">
                {errors.creditLimit.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DayField
              label="Día de cierre"
              error={errors.closingDay?.message}
              {...register('closingDay')}
            />
            <DayField
              label="Día de vencimiento"
              error={errors.dueDay?.message}
              {...register('dueDay')}
            />
          </div>
          <p className="text-[14px] leading-5 text-text-muted">
            Las compras hasta el día de cierre inclusive entran en ese resumen. Si el cierre o el
            vencimiento cambian, vale para las compras nuevas.
          </p>
        </div>
      )}

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
          Eliminar medio
        </Button>
      )}
    </form>
  )
}

const DayField = forwardRef<
  HTMLInputElement,
  { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>
>(function DayField({ label, error, ...props }, ref) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder="Ej: 25"
        aria-label={label}
        aria-invalid={Boolean(error) || undefined}
        className="h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted"
        {...props}
      />
      {error && (
        <span role="alert" className="text-sm text-expense">
          {error}
        </span>
      )}
    </label>
  )
})
