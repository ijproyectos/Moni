import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Account } from '@/features/accounts/domain/account'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import {
  transferFormSchema,
  type TransferFormInput,
  type TransferFormValues,
} from '../domain/transaction'

interface TransferFormProps {
  accounts: readonly Account[]
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: TransferFormValues) => void
}

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted'
const labelClass = 'text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted'

/** Presentational form for moving money between two own accounts. Transfers are not income or expense. */
export function TransferForm({ accounts, isSubmitting, submitError, onSubmit }: TransferFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TransferFormInput, unknown, TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountId: accounts[0]?.id ?? '',
      toAccountId: accounts[1]?.id ?? '',
      amount: '',
      occurredOn: todayIso(),
      note: '',
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div>
        <AmountInput
          prefix="$"
          aria-label="Monto"
          invalid={Boolean(errors.amount)}
          data-autofocus
          {...register('amount')}
        />
        {errors.amount && (
          <p role="alert" className="mt-1 text-sm text-expense">
            {errors.amount.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Desde</span>
          <select className={fieldClass} {...register('fromAccountId')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Hacia</span>
          <select className={fieldClass} {...register('toAccountId')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {errors.toAccountId && (
        <p role="alert" className="-mt-2 text-sm text-expense">
          {errors.toAccountId.message}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Fecha</span>
        <input type="date" className={fieldClass} {...register('occurredOn')} />
      </label>

      <input
        type="text"
        aria-label="Nota"
        placeholder="Nota (opcional)"
        maxLength={200}
        className={fieldClass}
        {...register('note')}
      />

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
