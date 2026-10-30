import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { isCreditCard, type Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { Button } from '@/shared/ui/Button'
import { CategorySelect } from '@/shared/ui/CategorySelect'
import {
  transactionFormSchema,
  type EntryKind,
  type Transaction,
  type TransactionFormInput,
  type TransactionFormValues,
} from '../domain/transaction'

/** What has been typed so far; lets the sheet keep it when switching to the shared-expense form. */
export interface TransactionDraft {
  amount: string
  note: string
  categoryId: string
  accountId: string
  occurredOn: string
}

interface TransactionFormProps {
  kind: EntryKind
  accounts: readonly Account[]
  /** Categories of `kind` the person can pick. */
  categories: readonly Category[]
  /** Present in edit mode: the form starts with its values. */
  initial?: Transaction
  /** Restores typed values (wins over the account/date defaults, not over `initial`). */
  draft?: TransactionDraft
  onDraftChange?: (draft: TransactionDraft) => void
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: TransactionFormValues) => void
  onCreateCategory: () => void
  /** Extra field rendered just above the save button (e.g. the trip an expense belongs to). */
  extra?: ReactNode
}

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink placeholder:text-text-muted'

/** Presentational form for expenses and incomes. Emits parsed values: amount in integer cents. */
export function TransactionForm({
  kind,
  accounts,
  categories,
  initial,
  draft,
  onDraftChange,
  isSubmitting,
  submitError,
  onSubmit,
  onCreateCategory,
  extra,
}: TransactionFormProps) {
  const online = useOnlineStatus()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransactionFormInput, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      kind,
      accountId: initial?.accountId ?? draft?.accountId ?? accounts[0]?.id ?? '',
      categoryId: initial?.categoryId ?? draft?.categoryId ?? '',
      amount: initial ? formatAmountInput(initial.amountCents) : (draft?.amount ?? ''),
      occurredOn: initial?.occurredOn ?? draft?.occurredOn ?? todayIso(),
      note: initial?.note ?? draft?.note ?? '',
    },
  })

  // Switching Gasto <-> Ingreso keeps what was typed but drops a category of the other kind.
  useEffect(() => {
    setValue('kind', kind)
    const current = watch('categoryId')
    if (current && !categories.some((c) => c.id === current)) setValue('categoryId', '')
  }, [kind, categories, setValue, watch])

  const categoryId = watch('categoryId')

  useEffect(() => {
    if (!onDraftChange) return
    const subscription = watch((values) =>
      onDraftChange({
        amount: values.amount ?? '',
        note: values.note ?? '',
        categoryId: values.categoryId ?? '',
        accountId: values.accountId ?? '',
        occurredOn: values.occurredOn ?? '',
      }),
    )
    return () => subscription.unsubscribe()
  }, [watch, onDraftChange])

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div>
        <AmountInput
          prefix={kind === 'expense' ? '-$' : '+$'}
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
          <p role="alert" className="mt-1 text-sm text-expense">
            {errors.note.message}
          </p>
        )}
      </div>

      <div>
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={(id) => setValue('categoryId', id, { shouldValidate: true })}
          onCreate={onCreateCategory}
          invalid={Boolean(errors.categoryId)}
        />
        {errors.categoryId && (
          <p role="alert" className="mt-2 text-sm text-expense">
            {errors.categoryId.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Cuenta
          </span>
          <select className={fieldClass} {...register('accountId')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {isCreditCard(a) ? `${a.name} · Tarjeta` : a.name}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <span role="alert" className="text-sm text-expense">
              {errors.accountId.message}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Fecha
          </span>
          <input type="date" className={fieldClass} {...register('occurredOn')} />
          {errors.occurredOn && (
            <span role="alert" className="text-sm text-expense">
              {errors.occurredOn.message}
            </span>
          )}
        </label>
      </div>

      {extra}
      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      {!online && (
        <p role="status" className="text-center text-sm font-semibold text-text-muted">
          {OFFLINE_MESSAGE}
        </p>
      )}
      <Button type="submit" variant="dark" disabled={isSubmitting || !online}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}
