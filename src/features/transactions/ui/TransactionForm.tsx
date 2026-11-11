import { zodResolver } from '@hookform/resolvers/zod'
import { Calendar, Check, CreditCard, Pencil, Plus } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { isCreditCard, type Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { todayAfterExpense } from '@/features/dashboard/domain/todayLeft'
import {
  applyAmountKey,
  formatAmountInput,
  parseAmountInput,
  type AmountKey,
} from '@/shared/lib/amountInput'
import { formatRelativeDay } from '@/shared/lib/dates'
import { isIsoDate, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { AmountInput } from '@/shared/ui/AmountInput'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MINT_PILL } from '@/shared/ui/mentaStyles'
import { NumericKeypad } from '@/shared/ui/NumericKeypad'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import {
  transactionFormSchema,
  type EntryKind,
  type Transaction,
  type TransactionFormInput,
  type TransactionFormValues,
} from '../domain/transaction'
import { PickerRow, ROW_CONTROL, RowIcon } from './FormRows'

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
  /** Last row of the white card (e.g. "Dividir con un grupo"). */
  extraRow?: ReactNode
  /** Today's allowance in cents (from "Hoy podés gastar"); null/absent without data: the "Te quedan" line is omitted. */
  dailyCents?: number | null
}

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
  extraRow,
  dailyCents = null,
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
  const amountText = watch('amount') ?? ''
  const accountId = watch('accountId')
  const occurredOn = watch('occurredOn') ?? ''

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

  function pressKey(key: AmountKey) {
    setValue('amount', applyAmountKey(amountText, key), {
      shouldDirty: true,
      shouldValidate: Boolean(errors.amount),
    })
  }

  const today = todayIso()
  const typedCents = parseAmountInput(amountText) ?? 0
  const showLeft = kind === 'expense' && dailyCents !== null && occurredOn === today
  const left = showLeft ? todayAfterExpense(dailyCents, typedCents).leftCents : 0
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? ''
  const submitLabel = isSubmitting
    ? 'Guardando…'
    : initial
      ? 'Guardar'
      : kind === 'expense'
        ? 'Guardar gasto'
        : 'Guardar ingreso'

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col items-center gap-0.5 py-1">
        <AmountInput
          scale="hero"
          prefix="$"
          aria-label="Monto"
          // The on-screen keypad types; the native keyboard stays closed here (it opens for the other fields).
          inputMode="none"
          invalid={Boolean(errors.amount)}
          size={Math.max(1, amountText.length)}
          data-autofocus
          {...register('amount')}
        />
        {showLeft && (
          <span className="text-[13px] text-text-muted">
            Te quedan <AmountDisplay cents={left} className="font-semibold text-ink" /> para hoy
          </span>
        )}
        {errors.amount && (
          <p role="alert" className="text-sm text-expense">
            {errors.amount.message}
          </p>
        )}
      </div>

      <div className="shrink-0">
        <div
          role="group"
          aria-label="Categoría"
          className="-mx-[18px] -my-1 flex gap-2 overflow-x-auto px-[18px] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon)
            const selected = category.id === categoryId
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setValue('categoryId', category.id, { shouldValidate: true })}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-[13px] py-2 font-display text-[13.5px] font-semibold',
                  FOCUS_RING,
                  selected ? 'bg-mint text-white' : 'bg-card text-ink',
                )}
              >
                <Icon aria-hidden="true" className="size-[15px]" strokeWidth={2} />
                {category.name}
              </button>
            )
          })}
          <button
            type="button"
            aria-label="Nueva categoría"
            onClick={onCreateCategory}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full bg-card px-[13px] py-2 font-display text-[13.5px] font-semibold text-text-muted',
              FOCUS_RING,
            )}
          >
            <Plus aria-hidden="true" className="size-[15px]" strokeWidth={2} />
            Nueva
          </button>
        </div>
        {errors.categoryId && (
          <p role="alert" className="mt-2 text-sm text-expense">
            {errors.categoryId.message}
          </p>
        )}
      </div>

      <div className="divide-y divide-line rounded-[26px] bg-card px-4 py-0.5">
        <PickerRow icon={CreditCard} label="Medio de pago" value={accountName}>
          <select aria-label="Cuenta" className={ROW_CONTROL} {...register('accountId')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {isCreditCard(a) ? `${a.name} · Tarjeta` : a.name}
              </option>
            ))}
          </select>
        </PickerRow>
        {errors.accountId && (
          <p role="alert" className="py-1 text-sm text-expense">
            {errors.accountId.message}
          </p>
        )}
        <PickerRow
          icon={Calendar}
          label="Fecha"
          value={isIsoDate(occurredOn) ? formatRelativeDay(occurredOn, today) : ''}
        >
          <input
            type="date"
            aria-label="Fecha"
            className={ROW_CONTROL}
            {...register('occurredOn')}
          />
        </PickerRow>
        {errors.occurredOn && (
          <p role="alert" className="py-1 text-sm text-expense">
            {errors.occurredOn.message}
          </p>
        )}
        <label
          className={cn(
            'grid grid-cols-[34px_1fr] items-center gap-3 py-2',
            'rounded-xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint-ink',
          )}
        >
          <RowIcon icon={Pencil} />
          <input
            type="text"
            aria-label="Nota"
            placeholder="Nota (opcional)"
            maxLength={200}
            className="min-w-0 bg-transparent text-[14.5px] font-medium text-ink outline-none placeholder:text-text-muted"
            {...register('note')}
          />
        </label>
        {errors.note && (
          <p role="alert" className="py-1 text-sm text-expense">
            {errors.note.message}
          </p>
        )}
        {extraRow}
      </div>

      {extra}

      <NumericKeypad onKey={pressKey} />

      <div className="mt-auto flex flex-col gap-2">
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
        <button
          type="submit"
          disabled={isSubmitting || !online}
          className={cn(MINT_PILL, 'h-[54px] text-[16px] font-bold')}
        >
          {!isSubmitting && <Check aria-hidden="true" className="size-5" strokeWidth={2.6} />}
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
