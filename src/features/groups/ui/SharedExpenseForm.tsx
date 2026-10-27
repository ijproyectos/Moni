import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '@/features/accounts/domain/account'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { SegmentedControl, type SegmentOption } from '@/shared/ui/SegmentedControl'
import {
  memberLabel,
  sharedExpenseFormSchema,
  type GroupMember,
  type SharedExpenseFormInput,
  type SharedExpenseFormValues,
} from '../domain/group'
import { equalPercentTexts, formatPercentTotal, previewSplit } from '../domain/expensePreview'
import type { SplitMethod } from '@/shared/lib/database.types'
import { fieldClass, labelClass } from './styles'

interface SharedExpenseFormProps {
  /** Active members of the group. */
  members: readonly GroupMember[]
  meId: string
  /** Expense category templates. */
  templates: readonly CategoryTemplate[]
  /** The person's own accounts. */
  accounts: readonly Account[]
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (values: SharedExpenseFormValues) => void
}

const NO_IDS: readonly string[] = []
const NO_PERCENTS: Readonly<Record<string, string>> = {}

const METHOD_OPTIONS: readonly SegmentOption<SplitMethod>[] = [
  { value: 'equal', label: 'Partes iguales' },
  { value: 'percent', label: 'Porcentaje' },
]

/** Nuevo gasto compartido: amount, payer, split method, participants and a live preview in cents. */
export function SharedExpenseForm({
  members,
  meId,
  templates,
  accounts,
  isSubmitting,
  submitError,
  onSubmit,
}: SharedExpenseFormProps) {
  const memberIds = useMemo(() => members.map((m) => m.userId), [members])
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SharedExpenseFormInput, unknown, SharedExpenseFormValues>({
    resolver: zodResolver(sharedExpenseFormSchema),
    defaultValues: {
      amount: '',
      description: '',
      templateSlug: null,
      occurredOn: todayIso(),
      paidBy: memberIds.includes(meId) ? meId : (memberIds[0] ?? ''),
      splitMethod: 'equal',
      participants: memberIds,
      percents: {},
      payerAccountId: null,
    },
  })

  const amount = watch('amount')
  const method = watch('splitMethod')
  const paidBy = watch('paidBy')
  const participants = watch('participants') ?? NO_IDS
  const percents = watch('percents') ?? NO_PERCENTS
  const templateSlug = watch('templateSlug')
  const payerAccountId = watch('payerAccountId')

  const preview = useMemo(
    () =>
      previewSplit({
        method,
        totalCents: parseAmountInput(amount ?? ''),
        payerId: paidBy,
        participantIds: participants,
        percentTexts: percents,
      }),
    [method, amount, paidBy, participants, percents],
  )
  const shareById = new Map(preview.shares?.map((s) => [s.userId, s.shareCents]))

  function setPercentsEqually(ids: readonly string[]) {
    const texts = equalPercentTexts(ids.length)
    setValue('percents', Object.fromEntries(ids.map((id, i) => [id, texts[i] ?? ''])))
  }

  // The payer account only makes sense when the person paid.
  useEffect(() => {
    if (paidBy !== meId) setValue('payerAccountId', null)
  }, [paidBy, meId, setValue])

  function toggleParticipant(id: string, checked: boolean) {
    const next = checked
      ? memberIds.filter((m) => m === id || participants.includes(m))
      : participants.filter((p) => p !== id)
    setValue('participants', next, { shouldValidate: true })
    if (method === 'percent') setPercentsEqually(next)
  }

  function changeMethod(next: SplitMethod) {
    setValue('splitMethod', next)
    if (next === 'percent') setPercentsEqually(participants)
  }

  const nameOf = (id: string) => {
    const member = members.find((m) => m.userId === id)
    const name = member ? memberLabel(member) : 'Sin nombre'
    return id === meId ? `${name} (vos)` : name
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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

      <div>
        <input
          type="text"
          aria-label="Descripción"
          placeholder="¿En qué se gastó?"
          maxLength={120}
          autoComplete="off"
          className={fieldClass}
          {...register('description')}
        />
        {errors.description && (
          <p role="alert" className="mt-1 px-2 text-sm text-expense">
            {errors.description.message}
          </p>
        )}
      </div>

      {templates.length > 0 && (
        <fieldset>
          <legend className={cn(labelClass, 'mb-2')}>Categoría</legend>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <CategoryChip
                key={t.slug}
                label={t.name}
                icon={getCategoryIcon(t.icon)}
                color={t.color}
                selected={templateSlug === t.slug}
                onClick={() => setValue('templateSlug', templateSlug === t.slug ? null : t.slug)}
              />
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Pagó</span>
          <select className={fieldClass} {...register('paidBy')}>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {nameOf(m.userId)}
              </option>
            ))}
          </select>
          {errors.paidBy && (
            <span role="alert" className="text-sm text-expense">
              {errors.paidBy.message}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Fecha</span>
          <input type="date" className={fieldClass} {...register('occurredOn')} />
          {errors.occurredOn && (
            <span role="alert" className="text-sm text-expense">
              {errors.occurredOn.message}
            </span>
          )}
        </label>
      </div>

      {paidBy === meId && accounts.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Pagado desde</span>
          <select
            className={fieldClass}
            value={payerAccountId ?? ''}
            onChange={(event) => setValue('payerAccountId', event.target.value || null)}
          >
            <option value="">Sin cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="px-2 text-sm leading-5 text-text-muted">
            Descuenta de tu cuenta el total; en tus gastos solo cuenta tu parte.
          </span>
        </label>
      )}

      <SegmentedControl
        label="Cómo dividir"
        options={METHOD_OPTIONS}
        value={method}
        onChange={changeMethod}
      />

      <fieldset>
        <legend className={cn(labelClass, 'mb-2')}>Entre quiénes</legend>
        <ul className="flex flex-col divide-y divide-cream rounded-xl border border-cream bg-white">
          {members.map((m) => {
            const checked = participants.includes(m.userId)
            const share = shareById.get(m.userId)
            return (
              <li key={m.userId} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleParticipant(m.userId, event.target.checked)}
                    className="size-5 accent-forest"
                  />
                  <span className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">
                    {nameOf(m.userId)}
                  </span>
                </label>
                {checked && method === 'percent' && (
                  <span className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Porcentaje de ${nameOf(m.userId)}`}
                      value={percents[m.userId] ?? ''}
                      onChange={(event) =>
                        setValue('percents', { ...percents, [m.userId]: event.target.value })
                      }
                      className="h-11 w-20 rounded-full border border-cream bg-canvas px-3 text-right text-[17px]"
                    />
                    <span aria-hidden="true">%</span>
                  </span>
                )}
                {checked && share !== undefined && (
                  <AmountDisplay
                    cents={share}
                    className="w-24 text-right font-display text-[17px] font-semibold"
                  />
                )}
              </li>
            )
          })}
        </ul>
        {errors.participants && (
          <p role="alert" className="mt-2 text-sm text-expense">
            {errors.participants.message}
          </p>
        )}
        {method === 'percent' && (
          <p
            aria-live="polite"
            className={cn(
              'mt-2 px-2 text-sm font-semibold',
              preview.percentTotalBp === 10000 ? 'text-income' : 'text-expense',
            )}
          >
            Suma {formatPercentTotal(preview.percentTotalBp)}% de 100%
          </p>
        )}
        {preview.problem && !errors.participants && !errors.percents && (
          <p className="mt-1 px-2 text-sm text-text-muted">{preview.problem}</p>
        )}
        {errors.percents && (
          <p role="alert" className="mt-1 px-2 text-sm text-expense">
            {(errors.percents as { message?: string }).message}
          </p>
        )}
      </fieldset>

      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" variant="dark" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar gasto'}
      </Button>
    </form>
  )
}
