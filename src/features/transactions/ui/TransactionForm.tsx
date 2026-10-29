import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { isCreditCard, type Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import {
  transactionFormSchema,
  type EntryKind,
  type Transaction,
  type TransactionFormInput,
  type TransactionFormValues,
} from '../domain/transaction'

interface TransactionFormProps {
  kind: EntryKind
  accounts: readonly Account[]
  /** Categories of `kind` the person can pick. */
  categories: readonly Category[]
  /** Present in edit mode: the form starts with its values. */
  initial?: Transaction
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: TransactionFormValues) => void
  onCreateCategory: () => void
}

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted'

/** Presentational form for expenses and incomes. Emits parsed values: amount in integer cents. */
export function TransactionForm({
  kind,
  accounts,
  categories,
  initial,
  isSubmitting,
  submitError,
  onSubmit,
  onCreateCategory,
}: TransactionFormProps) {
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
      accountId: initial?.accountId ?? accounts[0]?.id ?? '',
      categoryId: initial?.categoryId ?? '',
      amount: initial ? formatAmountInput(initial.amountCents) : '',
      occurredOn: initial?.occurredOn ?? todayIso(),
      note: initial?.note ?? '',
    },
  })

  // Switching Gasto <-> Ingreso keeps what was typed but drops a category of the other kind.
  useEffect(() => {
    setValue('kind', kind)
    const current = watch('categoryId')
    if (current && !categories.some((c) => c.id === current)) setValue('categoryId', '')
  }, [kind, categories, setValue, watch])

  const categoryId = watch('categoryId')

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

      <fieldset>
        <legend className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
          Categoría
        </legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              icon={getCategoryIcon(c.icon)}
              color={c.color}
              selected={categoryId === c.id}
              onClick={() => setValue('categoryId', c.id, { shouldValidate: true })}
            />
          ))}
          <CategoryChip
            label="Nueva categoría"
            icon={Plus}
            onClick={onCreateCategory}
            className="border-dashed"
          />
        </div>
        {errors.categoryId && (
          <p role="alert" className="mt-2 text-sm text-expense">
            {errors.categoryId.message}
          </p>
        )}
      </fieldset>

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
