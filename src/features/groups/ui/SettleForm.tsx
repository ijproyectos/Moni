import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Account } from '@/features/accounts/domain/account'
import { formatAmountInput } from '@/shared/lib/amountInput'
import type { Cents } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import {
  memberLabel,
  settlementFormSchema,
  type GroupMember,
  type SettlementFormInput,
  type SettlementFormValues,
} from '../domain/group'
import { fieldClass, labelClass } from './styles'

interface SettleFormProps {
  /** Active members other than the person. */
  recipients: readonly GroupMember[]
  accounts: readonly Account[]
  /** Suggested payment from `simplifyDebts`, if any. */
  initialToUser?: string
  initialAmountCents?: Cents
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: SettlementFormValues) => void
}

/** Saldar: to whom, how much (prefilled from the suggestion), when, note and optional account. */
export function SettleForm({
  recipients,
  accounts,
  initialToUser,
  initialAmountCents,
  isSubmitting,
  submitError,
  onSubmit,
}: SettleFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SettlementFormInput, unknown, SettlementFormValues>({
    resolver: zodResolver(settlementFormSchema),
    defaultValues: {
      toUser: initialToUser ?? recipients[0]?.userId ?? '',
      amount: initialAmountCents ? formatAmountInput(initialAmountCents) : '',
      occurredOn: todayIso(),
      note: '',
      accountId: null,
    },
  })
  const accountId = watch('accountId')

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Le pagás a</span>
        <select className={fieldClass} {...register('toUser')}>
          {recipients.map((m) => (
            <option key={m.userId} value={m.userId}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
        {errors.toUser && (
          <span role="alert" className="text-sm text-expense">
            {errors.toUser.message}
          </span>
        )}
      </label>

      <div>
        <AmountInput
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

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Fecha</span>
        <input type="date" className={fieldClass} {...register('occurredOn')} />
        {errors.occurredOn && (
          <span role="alert" className="text-sm text-expense">
            {errors.occurredOn.message}
          </span>
        )}
      </label>

      <div>
        <input
          type="text"
          aria-label="Nota"
          placeholder="Nota (opcional)"
          maxLength={200}
          className={fieldClass}
          {...register('note')}
        />
        {errors.note && (
          <p role="alert" className="mt-1 px-2 text-sm text-expense">
            {errors.note.message}
          </p>
        )}
      </div>

      {accounts.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Pagado desde</span>
          <select
            className={fieldClass}
            value={accountId ?? ''}
            onChange={(event) => setValue('accountId', event.target.value || null)}
          >
            <option value="">Sin cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="px-2 text-sm leading-5 text-text-muted">
            Descuenta el pago de tu cuenta. No cuenta como gasto: solo ajusta tu saldo del grupo.
          </span>
        </label>
      )}

      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" variant="dark" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Registrar pago'}
      </Button>
    </form>
  )
}
