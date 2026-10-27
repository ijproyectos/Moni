import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import {
  ACCOUNT_KIND_LABELS,
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
}

const KIND_OPTIONS = ACCOUNT_KINDS.map((value) => ({ value, label: ACCOUNT_KIND_LABELS[value] }))

export function AccountForm({
  initial,
  isSubmitting,
  submitError,
  onSubmit,
  onArchive,
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
      openingBalance: initial ? formatAmountInput(initial.openingBalanceCents) : '',
    },
  })
  const kind = watch('kind')

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-text-muted">
          Nombre
        </span>
        <input
          type="text"
          data-autofocus
          maxLength={40}
          placeholder="Ej: Cuenta sueldo"
          aria-invalid={Boolean(errors.name) || undefined}
          className="h-14 w-full rounded-full border border-cream bg-white px-5 text-[17px] text-forest placeholder:text-text-muted"
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
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-text-muted">
          Saldo inicial
        </span>
        <AmountInput
          scale="md"
          aria-label="Saldo inicial"
          invalid={Boolean(errors.openingBalance)}
          {...register('openingBalance')}
        />
        {errors.openingBalance && (
          <p role="alert" className="mt-1 text-sm text-expense">
            {errors.openingBalance.message}
          </p>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" variant="dark" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
      {onArchive && (
        <Button variant="ghost" onClick={onArchive} className="text-expense">
          Archivar cuenta
        </Button>
      )}
    </form>
  )
}
