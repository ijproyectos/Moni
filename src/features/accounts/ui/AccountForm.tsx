import { zodResolver } from '@hookform/resolvers/zod'
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import type { Category } from '@/features/categories/domain/category'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { todayIso } from '@/shared/lib/month'
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
import { BANK_CATALOG, normalizeBrandName, type BankBrand } from '../domain/bankCatalog'
import { defaultOpeningOrigin, originProblem, type OpeningOrigin } from '../domain/openingOrigin'
import { BrandLogo } from './BrandLogo'
import { OpeningOriginFields } from './OpeningOriginFields'

interface AccountFormProps {
  initial?: Account
  isSubmitting: boolean
  submitError: string | null
  /** `origin` says where the starting money comes from; it only matters for a new, non-card account. */
  onSubmit: (values: AccountFormValues, origin: OpeningOrigin) => void
  onArchive?: () => void
  /** Income categories offered for "Mi sueldo" / "Otro ingreso". */
  incomeCategories?: readonly Category[]
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
  incomeCategories = [],
  children,
}: AccountFormProps) {
  const [origin, setOrigin] = useState<OpeningOrigin>(() => defaultOpeningOrigin(todayIso()))
  const [originError, setOriginError] = useState<string | null>(null)
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
  const typedName = watch('name') ?? ''
  const openingText = watch('openingBalance') ?? ''
  const openingCents = parseAmountInput(String(openingText)) ?? 0
  // A new ordinary account asks where its starting money comes from; a card's debt keeps its own logic.
  const asksOrigin = !initial && kind !== 'credit_card' && openingCents > 0
  // Editing: a balance that is already a movement is changed with "Ajustar saldo", not here.
  const showOpening = kind === 'credit_card' || !initial || initial.openingBalanceCents > 0

  // Prefills name and type; both stay editable. A card brand switches the form to credit-card mode.
  function pickBrand(brand: BankBrand) {
    setValue('name', brand.name, { shouldValidate: true })
    setValue('kind', brand.kind)
  }

  function submit(values: AccountFormValues) {
    const problem = asksOrigin ? originProblem(origin) : null
    setOriginError(problem)
    if (problem) return
    onSubmit(values, origin)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4">
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
          className="h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink placeholder:text-text-muted"
          {...register('name')}
        />
        {errors.name && (
          <span role="alert" className="text-sm text-expense">
            {errors.name.message}
          </span>
        )}
      </label>

      {!initial && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Agregar rápido
          </span>
          <ul className="flex flex-wrap gap-2">
            {BANK_CATALOG.map((brand) => (
              <li key={brand.id}>
                <button
                  type="button"
                  onClick={() => pickBrand(brand)}
                  aria-pressed={normalizeBrandName(typedName) === normalizeBrandName(brand.name)}
                  className="flex min-h-11 items-center gap-2 rounded-full border-2 border-sand bg-card py-1 pl-1.5 pr-4 text-[16px] font-extrabold text-ink aria-pressed:border-ink"
                >
                  <BrandLogo brand={brand} size="sm" />
                  {brand.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SegmentedControl
        label="Tipo de cuenta"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(value) => setValue('kind', value)}
      />

      {showOpening && (
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
      )}

      {asksOrigin && (
        <OpeningOriginFields
          value={origin}
          onChange={(next) => {
            setOriginError(null)
            setOrigin(next)
          }}
          categories={incomeCategories}
          error={originError}
        />
      )}

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
        className="h-14 w-full rounded-[18px] border border-sand bg-card px-4 text-[17px] text-ink placeholder:text-text-muted"
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
