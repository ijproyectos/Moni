import { ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Account } from '@/features/accounts/domain/account'
import type { DraftMovement } from '@/features/ai/domain/draft'
import type { Category } from '@/features/categories/domain/category'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatRelativeDay } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { cn } from '@/shared/ui/cn'

interface MovementConfirmCardsProps {
  drafts: readonly DraftMovement[]
  categories: readonly Category[]
  accounts: readonly Account[]
  today: string
  /** Per-draft error text (validation or a failed save), by draft key. */
  errors: Readonly<Record<string, string>>
  disabled?: boolean
  onChange: (key: string, patch: Partial<DraftMovement>) => void
  onRemove: (key: string) => void
}

/** Text that turns into a small input when tapped, and back when it loses focus or on Enter. */
function InlineEdit({
  label,
  value,
  display,
  inputMode,
  maxLength,
  disabled,
  onChange,
  className,
}: {
  label: string
  value: string
  display: string
  inputMode?: 'decimal'
  maxLength?: number
  disabled?: boolean
  onChange: (value: string) => void
  className: string
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        autoComplete="off"
        aria-label={label}
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className={cn(
          className,
          'w-full min-w-0 rounded-[12px] border border-sand bg-canvas px-2 outline-none',
        )}
      />
    )
  }
  return (
    <button
      type="button"
      aria-label={`${label}: ${display}`}
      disabled={disabled}
      onClick={() => setEditing(true)}
      className={cn(className, 'block w-full min-w-0 truncate text-left')}
    >
      {display}
    </button>
  )
}

/** A compact dropdown (the native one: small, accessible and good on phones) shown as a pill with a chevron. */
function PillSelect({
  label,
  value,
  disabled,
  onChange,
  children,
  warn,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  children: React.ReactNode
  warn?: boolean
}) {
  return (
    <span className="relative inline-flex min-w-0 max-w-full">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full min-w-0 appearance-none truncate rounded-full py-0 pl-3 pr-8 text-[14px] font-bold text-ink',
          warn ? 'bg-gold/30 ring-1 ring-gold' : 'bg-sand',
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink"
      />
    </span>
  )
}

/**
 * Confirmation of what Moni understood, one compact card per movement: the amount and the note up front (tap to fix them),
 * and the category, the account and the date as small dropdowns. Nothing is saved here.
 */
export function MovementConfirmCards({
  drafts,
  categories,
  accounts,
  today,
  errors,
  disabled = false,
  onChange,
  onRemove,
}: MovementConfirmCardsProps) {
  // With several movements the cards get tighter, so the list stays short.
  const dense = drafts.length > 1
  return (
    <ul className="flex flex-col gap-2.5">
      {drafts.map((draft, index) => {
        const n = index + 1
        const cents = parseAmountInput(draft.amount)
        const options = categories.filter((c) => c.kind === draft.kind)
        const error = errors[draft.key]
        const hint =
          draft.accountId === ''
            ? 'Elegí con qué cuenta o medio de pago.'
            : draft.categoryId === ''
              ? 'Elegí una categoría.'
              : draft.accountUnmatched
                ? 'No encontré la cuenta que nombraste: revisala.'
                : draft.confidence < 0.7
                  ? 'No estoy segura de este: revisalo.'
                  : null
        return (
          <li
            key={draft.key}
            aria-label={`Movimiento ${n}`}
            className={cn('rounded-[24px] bg-card ring-1 ring-sand', dense ? 'p-3' : 'p-3.5')}
          >
            <div className="flex items-center justify-between gap-2">
              <div role="group" aria-label={`Tipo del movimiento ${n}`} className="flex gap-1">
                {(['expense', 'income'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={draft.kind === kind}
                    disabled={disabled}
                    onClick={() =>
                      draft.kind !== kind && onChange(draft.key, { kind, categoryId: '' })
                    }
                    className={cn(
                      'min-h-8 rounded-full px-3 font-display text-[13px] font-extrabold',
                      draft.kind === kind
                        ? kind === 'expense'
                          ? 'bg-blush text-forest'
                          : 'bg-lime text-forest'
                        : 'bg-transparent text-text-muted',
                    )}
                  >
                    {kind === 'expense' ? 'Gasto' : 'Ingreso'}
                  </button>
                ))}
              </div>
              {drafts.length > 1 && (
                <button
                  type="button"
                  aria-label={`Quitar movimiento ${n}`}
                  disabled={disabled}
                  onClick={() => onRemove(draft.key)}
                  className="flex size-9 items-center justify-center rounded-full text-text-muted"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>

            <div className="mt-1">
              <InlineEdit
                label={`Monto del movimiento ${n}`}
                value={draft.amount}
                display={cents !== null && cents > 0 ? formatArs(cents) : 'Poné el monto'}
                inputMode="decimal"
                disabled={disabled}
                onChange={(amount) => onChange(draft.key, { amount })}
                className={cn(
                  dense
                    ? 'font-display text-[26px] font-extrabold leading-8'
                    : 'font-display text-[34px] font-extrabold leading-10',
                  draft.kind === 'expense' ? 'text-ink' : 'text-income',
                  cents === null || cents <= 0 ? '!text-text-muted !text-[24px]' : '',
                )}
              />
              <InlineEdit
                label={`Nota del movimiento ${n}`}
                value={draft.note}
                display={draft.note.trim() === '' ? 'Agregar una nota' : draft.note}
                maxLength={200}
                disabled={disabled}
                onChange={(note) => onChange(draft.key, { note })}
                className={cn(
                  dense ? 'text-[15px] leading-5' : 'text-[17px] leading-6',
                  draft.note.trim() === '' ? 'text-text-muted' : 'text-ink',
                )}
              />
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <PillSelect
                label={`Categoría del movimiento ${n}`}
                value={draft.categoryId}
                disabled={disabled}
                warn={draft.categoryId === ''}
                onChange={(categoryId) => onChange(draft.key, { categoryId })}
              >
                {draft.categoryId === '' && (
                  <option value="" disabled>
                    Elegir categoría
                  </option>
                )}
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </PillSelect>
              <PillSelect
                label={`Cuenta del movimiento ${n}`}
                value={draft.accountId}
                disabled={disabled}
                warn={draft.accountId === '' || draft.accountUnmatched}
                onChange={(accountId) =>
                  onChange(draft.key, { accountId, accountUnmatched: false })
                }
              >
                {draft.accountId === '' && (
                  <option value="" disabled>
                    Elegir cuenta
                  </option>
                )}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </PillSelect>
              <span className="relative inline-flex h-9 items-center px-2 text-[14px] font-bold text-text-muted">
                {formatRelativeDay(draft.occurredOn, today)}
                <input
                  type="date"
                  aria-label={`Fecha del movimiento ${n}`}
                  value={draft.occurredOn}
                  max={today}
                  disabled={disabled}
                  onChange={(e) =>
                    e.target.value && onChange(draft.key, { occurredOn: e.target.value })
                  }
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </span>
            </div>

            {hint && !error && (
              <p className="mt-1.5 text-[13px] font-semibold text-[#8a5a00] dark:text-gold">{hint}</p>
            )}
            {error && (
              <p role="alert" className="mt-1.5 text-[13px] font-semibold text-expense">
                {error}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
