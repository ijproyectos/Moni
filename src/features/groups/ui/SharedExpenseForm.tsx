import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '@/features/accounts/domain/account'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import type { GroupKind } from '@/shared/lib/database.types'
import { formatArs } from '@/shared/lib/money'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { todayIso } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { Avatar, SectionLabel } from '@/shared/ui/kit'
import { SegmentedControl, type SegmentOption } from '@/shared/ui/SegmentedControl'
import {
  memberLabel,
  sharedExpenseFormSchema,
  type GroupMember,
  type SharedExpenseFormInput,
  type SharedExpenseFormValues,
} from '../domain/group'
import { equalPercentTexts, formatPercentTotal, previewSplit } from '../domain/expensePreview'
import { splitByWeights, type LedgerExpense } from '../domain/ledger'
import { FEATURES } from '@/shared/config/features'
import type { Guest, SimAmount, SimExpense } from '../mock/overlayStore'
import { fieldClass, labelClass } from './styles'

type UiMethod = 'equal' | 'amount' | 'percent' | 'income' | 'solo'

export type SimulatedExpenseInput = Omit<SimExpense, 'id' | 'createdAt'>

interface SharedExpenseFormProps {
  /** Active members of the group (they have Moni). */
  members: readonly GroupMember[]
  meId: string
  /** Expense category templates. */
  templates: readonly CategoryTemplate[]
  /** The person's own accounts. */
  accounts: readonly Account[]
  isSubmitting: boolean
  submitError: string | null
  /** Real expense (single payer, equal or percent split among people with Moni). */
  onSubmit: (values: SharedExpenseFormValues) => void
  /** People without Moni (simulated overlay). */
  guests?: readonly Guest[]
  kind?: GroupKind
  /** My share for couples split by income (0..1). */
  incomeShare?: number
  /** Anything the database cannot store yet goes here (in-memory only). */
  onSubmitSimulated?: (expense: SimulatedExpenseInput) => void
  /** Prefill when editing. */
  initial?: LedgerExpense
  /** Prefill for a new expense started elsewhere (e.g. the new-movement sheet). */
  defaults?: Partial<{
    amount: string
    description: string
    occurredOn: string
    templateSlug: string | null
    payerAccountId: string | null
  }>
  submitLabel?: string
  onDelete?: () => void
}

const NO_PERCENTS: Readonly<Record<string, string>> = {}

function methodOptions(kind: GroupKind | undefined): readonly SegmentOption<UiMethod>[] {
  // "Por monto" and "Según ingresos" only exist in the simulated overlay (no backend yet).
  const simulatedSplits = FEATURES.groupGuestsAndSimulatedSplits
  return kind === 'pareja'
    ? [
        { value: 'equal', label: '50/50' },
        ...(simulatedSplits ? [{ value: 'income' as const, label: 'Según ingresos' }] : []),
        { value: 'solo', label: 'Solo uno' },
      ]
    : [
        { value: 'equal', label: 'Partes iguales' },
        ...(simulatedSplits ? [{ value: 'amount' as const, label: 'Por monto' }] : []),
        { value: 'percent', label: 'Por %' },
      ]
}

/** Mirrors the database: leftover cents go first to the payer, then by ascending id. */
function equalShares(total: number, ids: readonly string[], payerId: string): SimAmount[] {
  const order = [...ids].sort(
    (a, b) => Number(b === payerId) - Number(a === payerId) || (a < b ? -1 : a > b ? 1 : 0),
  )
  const shares = splitByWeights(
    total,
    order,
    order.map(() => 1),
  )
  return ids.map((id) => shares.find((s) => s.personId === id) ?? { personId: id, cents: 0 })
}

// Screens 053 / 054 / 055 / 061 / 089 / 091 / 104 / 132 / 133 — Nuevo / Editar gasto.
export function SharedExpenseForm({
  members,
  meId,
  templates,
  accounts,
  isSubmitting,
  submitError,
  onSubmit,
  guests = [],
  kind,
  incomeShare = 0.6,
  onSubmitSimulated,
  initial,
  defaults,
  submitLabel = 'Guardar gasto',
  onDelete,
}: SharedExpenseFormProps) {
  const online = useOnlineStatus()
  const memberIds = useMemo(() => members.map((m) => m.userId), [members])
  const people = useMemo(
    () => [
      ...members.map((m) => ({
        id: m.userId,
        name: m.userId === meId ? 'Vos' : memberLabel(m),
        hasMoni: true,
      })),
      ...guests.map((g) => ({ id: g.id, name: g.name, hasMoni: false })),
    ],
    [members, guests, meId],
  )
  const allIds = people.map((p) => p.id)
  const couple = kind === 'pareja'

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<SharedExpenseFormInput, unknown, SharedExpenseFormValues>({
    resolver: zodResolver(sharedExpenseFormSchema),
    defaultValues: {
      amount: initial ? formatAmountInput(initial.amountCents) : (defaults?.amount ?? ''),
      description: initial?.description ?? defaults?.description ?? '',
      templateSlug: initial?.templateSlug ?? defaults?.templateSlug ?? null,
      occurredOn: initial?.occurredOn ?? defaults?.occurredOn ?? todayIso(),
      paidBy:
        initial?.payers[0]?.personId ?? (memberIds.includes(meId) ? meId : (memberIds[0] ?? '')),
      splitMethod: 'equal',
      participants: memberIds,
      percents: {},
      payerAccountId: defaults?.payerAccountId ?? null,
    },
  })

  const amountText = watch('amount')
  const paidBy = watch('paidBy')
  const percents = watch('percents') ?? NO_PERCENTS
  const templateSlug = watch('templateSlug')
  const payerAccountId = watch('payerAccountId')
  const total = parseAmountInput(amountText ?? '') ?? 0

  const [method, setMethod] = useState<UiMethod>('equal')
  const [selected, setSelected] = useState<string[]>(
    initial ? initial.shares.map((s) => s.personId) : allIds,
  )
  const [multiPayer, setMultiPayer] = useState(Boolean(initial && initial.payers.length > 1))
  const [payers, setPayers] = useState<Record<string, string>>(
    initial && initial.payers.length > 1
      ? Object.fromEntries(initial.payers.map((p) => [p.personId, formatAmountInput(p.cents)]))
      : {},
  )
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [details, setDetails] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  const realSelected = selected.filter((id) => memberIds.includes(id))
  // Keep the real form in sync with the chosen people.
  useEffect(() => {
    setValue('participants', realSelected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(',')])

  useEffect(() => {
    if (paidBy !== meId) setValue('payerAccountId', null)
  }, [paidBy, meId, setValue])

  const payerList: SimAmount[] = multiPayer
    ? Object.entries(payers)
        .map(([personId, text]) => ({ personId, cents: parseAmountInput(text) ?? 0 }))
        .filter((p) => p.cents > 0)
    : [{ personId: paidBy, cents: total }]
  const payersTotal = payerList.reduce((s, p) => s + p.cents, 0)

  const percentPreview = useMemo(
    () =>
      previewSplit({
        method: 'percent',
        totalCents: total || null,
        payerId: paidBy,
        participantIds: selected,
        percentTexts: percents,
      }),
    [total, paidBy, selected, percents],
  )

  // Shares per person for the current method (null when not computable yet).
  const shares: SimAmount[] | null = (() => {
    if (total <= 0 || selected.length === 0) return null
    if (method === 'equal' || method === 'solo') return equalShares(total, selected, paidBy)
    if (method === 'income') {
      const ids = selected
      return splitByWeights(
        total,
        ids,
        ids.map((id) => (id === meId ? incomeShare : 1 - incomeShare) * 100),
      )
    }
    if (method === 'amount')
      return selected.map((id) => ({
        personId: id,
        cents: parseAmountInput(amounts[id] ?? '') ?? 0,
      }))
    return percentPreview.shares?.map((s) => ({ personId: s.userId, cents: s.shareCents })) ?? null
  })()
  const shareOf = (id: string) => shares?.find((s) => s.personId === id)?.cents
  const amountsSum = method === 'amount' ? (shares ?? []).reduce((s, x) => s + x.cents, 0) : 0

  const usesGuest =
    selected.some((id) => !memberIds.includes(id)) ||
    payerList.some((p) => !memberIds.includes(p.personId))
  const simulated = Boolean(onSubmitSimulated) && (multiPayer || method === 'amount' || usesGuest)

  function setPercentsEqually(ids: readonly string[]) {
    const texts = equalPercentTexts(ids.length)
    setValue('percents', Object.fromEntries(ids.map((id, i) => [id, texts[i] ?? ''])))
  }

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : allIds.filter((x) => x === id || selected.includes(x))
    setSelected(next)
    if (method === 'percent') setPercentsEqually(next)
  }

  function changeMethod(next: UiMethod) {
    setMethod(next)
    setSimError(null)
    if (next === 'percent') setPercentsEqually(selected)
    if (next === 'amount') {
      const eq = equalShares(total, selected, paidBy)
      setAmounts(
        Object.fromEntries(eq.map((s) => [s.personId, s.cents ? formatAmountInput(s.cents) : ''])),
      )
    }
    if (next === 'solo') {
      const other = allIds.find((id) => id !== paidBy)
      setSelected(other ? [other] : [paidBy])
    }
    if (next === 'equal' || next === 'income') setSelected(allIds)
  }

  function submitSimulated() {
    setSimError(null)
    const description = getValues('description').trim()
    if (total <= 0) return setSimError('Ingresá un monto mayor a cero.')
    if (!description) return setSimError('Contá en qué se gastó.')
    if (selected.length === 0) return setSimError('Elegí al menos una persona.')
    if (multiPayer && payersTotal !== total)
      return setSimError(`Lo que pagó cada uno tiene que sumar ${formatArs(total)}.`)
    if (!shares || shares.reduce((s, x) => s + x.cents, 0) !== total)
      return setSimError(
        method === 'percent'
          ? 'Los porcentajes tienen que sumar 100.'
          : `Las partes tienen que sumar ${formatArs(total)}.`,
      )
    onSubmitSimulated?.({
      description,
      amountCents: total,
      payers: payerList,
      shares,
      occurredOn: getValues('occurredOn'),
      templateSlug: getValues('templateSlug') ?? null,
      methodLabel:
        method === 'amount'
          ? 'por monto'
          : method === 'percent'
            ? 'por %'
            : `entre ${selected.length}`,
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (simulated) return submitSimulated()
    if (method === 'income' && realSelected.length >= 1) {
      setValue('splitMethod', 'percent')
      const pct =
        shares?.map(
          (s) => [s.personId, String(Math.round((s.cents / total) * 10000) / 100)] as const,
        ) ?? []
      const texts = equalPercentTexts(realSelected.length)
      setValue(
        'percents',
        pct.length
          ? Object.fromEntries(adjustTo100(pct))
          : Object.fromEntries(realSelected.map((id, i) => [id, texts[i] ?? ''])),
      )
    } else {
      setValue('splitMethod', method === 'percent' ? 'percent' : 'equal')
    }
    void handleSubmit(onSubmit)()
  }

  const errorText =
    simError ??
    errors.participants?.message ??
    (errors.percents as { message?: string } | undefined)?.message
  const others = people.filter((p) => selected.includes(p.id) && p.id !== paidBy)
  const payerName = people.find((p) => p.id === paidBy)?.name ?? 'Alguien'
  const guestNames = people.filter((p) => !p.hasMoni && selected.includes(p.id)).map((p) => p.name)

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
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

      <SectionLabel
        action={
          !couple && onSubmitSimulated ? (
            <button
              type="button"
              onClick={() => setMultiPayer((v) => !v)}
              className="text-[15px] font-extrabold"
            >
              {multiPayer ? 'Uno solo' : 'Pagaron varios'}
            </button>
          ) : undefined
        }
      >
        {multiPayer ? '¿Quiénes pagaron?' : '¿Quién pagó?'}
      </SectionLabel>
      <div role="group" aria-label="Quién pagó" className="flex flex-wrap gap-2">
        {people.map((p) => {
          const active = multiPayer ? p.id in payers : paidBy === p.id
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (multiPayer) {
                  setPayers((cur) =>
                    p.id in cur
                      ? Object.fromEntries(Object.entries(cur).filter(([id]) => id !== p.id))
                      : { ...cur, [p.id]: '' },
                  )
                } else if (p.hasMoni || onSubmitSimulated) {
                  setValue('paidBy', p.id)
                }
              }}
              className={cn(
                'inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 pl-1 pr-3 text-[16px] font-extrabold',
                active ? 'border-ink bg-forest text-cream' : 'border-sand bg-card',
              )}
            >
              <Avatar name={p.name} size="sm" />
              {p.name}
            </button>
          )
        })}
      </div>
      {multiPayer && Object.keys(payers).length > 0 && (
        <>
          <div className="divide-y divide-sand rounded-[22px] border border-sand bg-card px-4">
            {Object.keys(payers).map((id) => {
              const person = people.find((p) => p.id === id)
              return (
                <div key={id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={person?.name ?? '?'} size="sm" />
                  <span className="flex-1 text-[17px] font-extrabold">{person?.name}</span>
                  <AmountField
                    label={`Pagó ${person?.name}`}
                    value={payers[id] ?? ''}
                    onChange={(v) => setPayers((cur) => ({ ...cur, [id]: v }))}
                  />
                </div>
              )
            })}
          </div>
          <SumLine
            ok={payersTotal === total}
            text={`Suman ${formatArs(payersTotal)} de ${formatArs(total)}`}
          />
        </>
      )}

      <SectionLabel>{multiPayer ? '¿Entre quiénes se divide?' : '¿Cómo se divide?'}</SectionLabel>
      {!multiPayer && (
        <SegmentedControl
          label="Cómo dividir"
          options={methodOptions(kind)}
          value={method}
          onChange={changeMethod}
        />
      )}

      <fieldset>
        <legend className="sr-only">Entre quiénes</legend>
        <ul className="flex flex-col divide-y divide-sand rounded-[22px] border border-sand bg-card">
          {people.map((p) => {
            const checked = selected.includes(p.id)
            const share = shareOf(p.id)
            return (
              <li key={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.id)}
                    aria-label={p.name}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-[8px] border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-gold',
                      checked ? 'border-ink bg-forest text-lime' : 'border-line bg-card',
                    )}
                  >
                    {checked && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  <Avatar name={p.name} size="sm" className={cn(!checked && 'opacity-50')} />
                  <span
                    className={cn(
                      'min-w-0 truncate text-[18px] font-extrabold',
                      !checked && 'text-text-muted',
                    )}
                  >
                    {p.name}
                  </span>
                  {!p.hasMoni && (
                    <span className="shrink-0 rounded-full bg-gold/40 px-2 py-0.5 text-[12px] font-extrabold">
                      Sin Moni
                    </span>
                  )}
                </label>
                {!checked ? (
                  <span className="text-[16px] font-bold text-text-muted">No participa</span>
                ) : method === 'amount' ? (
                  <AmountField
                    label={`Parte de ${p.name}`}
                    value={amounts[p.id] ?? ''}
                    onChange={(v) => setAmounts((cur) => ({ ...cur, [p.id]: v }))}
                  />
                ) : method === 'percent' ? (
                  <span className="flex items-center gap-2">
                    {share !== undefined && (
                      <span className="text-[14px] text-text-muted">{formatArs(share)}</span>
                    )}
                    <span className="flex h-11 items-center rounded-[14px] border border-sand bg-canvas px-3 text-[18px] font-extrabold">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Porcentaje de ${p.name}`}
                        value={percents[p.id] ?? ''}
                        onChange={(event) =>
                          setValue('percents', { ...percents, [p.id]: event.target.value })
                        }
                        className="w-14 bg-transparent text-right outline-none"
                      />
                      <span aria-hidden="true" className="ml-1">
                        %
                      </span>
                    </span>
                  </span>
                ) : (
                  share !== undefined && (
                    <span className="text-[18px] font-extrabold tabular-nums">
                      {formatArs(share)}
                    </span>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </fieldset>

      {method === 'percent' && !multiPayer && (
        <SumLine
          ok={percentPreview.percentTotalBp === 10000}
          text={
            percentPreview.percentTotalBp === 10000
              ? 'Suman 100%. Listo.'
              : `Suman ${formatPercentTotal(percentPreview.percentTotalBp)}% de 100%`
          }
        />
      )}
      {method === 'amount' && !multiPayer && (
        <SumLine
          ok={amountsSum === total && total > 0}
          text={`Suman ${formatArs(amountsSum)} de ${formatArs(total)}.${amountsSum === total && total > 0 ? ' Listo.' : ''}`}
        />
      )}
      {(method === 'equal' || method === 'income' || method === 'solo' || multiPayer) && shares && (
        <p className="text-[15px] leading-5 text-text-muted">
          {method === 'solo'
            ? `Es solo de ${others[0]?.name ?? payerName}: ${others[0] ? `te debe los ${formatArs(total)} completos.` : 'no se divide.'}`
            : multiPayer
              ? `Partes iguales · ${formatArs(shares[0]?.cents ?? 0)} cada uno.`
              : method === 'income'
                ? `Vos ponés ${formatArs(shareOf(meId) ?? 0)} y ${others.find((o) => o.id !== meId)?.name ?? 'tu pareja'} ${formatArs(shares.find((s) => s.personId !== meId)?.cents ?? 0)}.`
                : `Cada uno pone ${formatArs(shares[0]?.cents ?? 0)}.${others.length > 0 && paidBy === meId ? ` ${others.map((o) => o.name).join(', ')} te ${others.length > 1 ? 'pasan' : 'pasa'} ${formatArs(shares[0]?.cents ?? 0)} a vos.` : ''}`}
          {guestNames.length > 0 &&
            ` ${guestNames.join(' y ')} no ${guestNames.length > 1 ? 'tienen' : 'tiene'} Moni, pero se cuenta${guestNames.length > 1 ? 'n' : ''}.`}
        </p>
      )}

      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        aria-expanded={details}
        className="flex items-center gap-1 self-start text-[15px] font-extrabold text-text-muted"
      >
        Fecha, categoría y cuenta
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 transition', details && 'rotate-180')}
        />
      </button>
      {details && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Fecha</span>
            <input type="date" className={fieldClass} {...register('occurredOn')} />
          </label>
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
                    onClick={() =>
                      setValue('templateSlug', templateSlug === t.slug ? null : t.slug)
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}
          {paidBy === meId && accounts.length > 0 && !simulated && (
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
        </div>
      )}

      {simulated && (
        <p className="rounded-[14px] bg-gold/25 px-3 py-2 text-[13px] leading-4">
          Este gasto usa funciones nuevas: se guarda solo en este dispositivo hasta que estén
          disponibles.
        </p>
      )}
      {initial && (
        <p className="text-[15px] leading-5 text-text-muted">
          Si cambiás algo, Moni recalcula las cuentas y avisa a quienes tienen la app.
        </p>
      )}
      {errorText && (
        <p role="alert" className="text-center text-sm text-expense">
          {errorText}
        </p>
      )}
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
      <div className="flex gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar gasto"
            className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-sand bg-card text-expense"
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
        )}
        <Button type="submit" disabled={isSubmitting || !online}>
          {isSubmitting ? 'Guardando…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Rounds percentages to 2 decimals and fixes the last one so they add up to exactly 100. */
function adjustTo100(entries: readonly (readonly [string, string])[]): [string, string][] {
  const values = entries.map(([id, v]) => [id, Math.round(Number(v) * 100)] as const)
  const sum = values.reduce((s, [, bp]) => s + bp, 0)
  return values.map(([id, bp], i) => [
    id,
    String(
      ((i === values.length - 1 ? bp + 10000 - sum : bp) / 100).toFixed(2).replace(/\.?0+$/, ''),
    ),
  ])
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <span className="flex h-11 items-center rounded-[14px] border border-sand bg-canvas px-3 text-[18px] font-extrabold">
      $
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-transparent text-right outline-none"
      />
    </span>
  )
}

function SumLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 rounded-[14px] px-3 py-2 text-[15px] font-extrabold',
        ok ? 'bg-lime/30 text-ink' : 'bg-blush/30 text-expense',
      )}
    >
      {ok && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
      {text}
    </p>
  )
}
