import { Calendar, CreditCard, Tag, Trash2, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Account } from '@/features/accounts/domain/account'
import type { DraftMovement } from '@/features/ai/domain/draft'
import type { Category } from '@/features/categories/domain/category'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatRelativeDay } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { formatAmountEvent } from '@/shared/ui/amountField'

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
  /** Line inside the card of a single movement (e.g. "Con este gasto, hoy te quedan $X"). */
  cardFooter?: ReactNode
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
        onChange={(e) => {
          // Amount fields show es-AR thousands separators while typing.
          if (inputMode === 'decimal') formatAmountEvent(e)
          onChange(e.target.value)
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        className={cn(
          className,
          'w-full min-w-0 rounded-[12px] border border-line bg-canvas px-2 outline-none',
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

/**
 * A chip (Menta) that is a native dropdown underneath: the select lies invisible over the chip, so the native picker
 * opens on tap and the keyboard and screen readers keep a real <select>.
 */
function PillSelect({
  label,
  value,
  text,
  icon: Icon,
  disabled,
  onChange,
  children,
  warn,
}: {
  label: string
  value: string
  /** What the chip says: the selected option. */
  text: string
  icon: LucideIcon
  disabled?: boolean
  onChange: (value: string) => void
  children: ReactNode
  warn?: boolean
}) {
  return (
    <span
      className={cn(
        'relative inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 py-[7px] text-[13.5px] font-medium text-ink',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint-ink',
        warn ? 'bg-warn-bg ring-1 ring-gold' : 'bg-canvas',
      )}
    >
      <Icon aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={1.9} />
      <span className="truncate">{text}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0 outline-none"
      >
        {children}
      </select>
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
  cardFooter,
}: MovementConfirmCardsProps) {
  // With several movements the cards get tighter, so the list stays short.
  const dense = drafts.length > 1
  return (
    <ul className="flex flex-col gap-3">
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
            className={cn(
              'flex flex-col rounded-[28px] bg-card px-4 text-ink',
              dense ? 'gap-2 py-3' : 'gap-2.5 py-3.5',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-text-muted">
                Moni entendió
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[13px] font-medium text-mint-ink">Tocá para corregir</span>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Quitar movimiento ${n}`}
                    disabled={disabled}
                    onClick={() => onRemove(draft.key)}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full text-text-muted',
                      FOCUS_RING,
                    )}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                )}
              </span>
            </div>

            <div>
              <InlineEdit
                label={`Monto del movimiento ${n}`}
                value={draft.amount}
                display={cents !== null && cents > 0 ? formatArs(cents) : 'Poné el monto'}
                inputMode="decimal"
                disabled={disabled}
                onChange={(amount) => onChange(draft.key, { amount })}
                className={cn(
                  'font-display font-bold leading-none tracking-[-0.04em]',
                  dense ? 'py-1 text-[30px]' : 'py-1 text-[40px]',
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
                  dense ? 'text-[14px] leading-5' : 'text-[15px] leading-6',
                  draft.note.trim() === '' ? 'text-text-muted' : 'text-ink',
                )}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                      'rounded-full px-3 py-[7px] text-[13.5px] font-medium',
                      FOCUS_RING,
                      draft.kind === kind ? 'bg-mint text-white' : 'bg-canvas text-ink',
                    )}
                  >
                    {kind === 'expense' ? 'Gasto' : 'Ingreso'}
                  </button>
                ))}
              </div>
              <PillSelect
                label={`Categoría del movimiento ${n}`}
                value={draft.categoryId}
                text={
                  options.find((c) => c.id === draft.categoryId)?.name ?? 'Elegir categoría'
                }
                icon={
                  draft.categoryId
                    ? getCategoryIcon(options.find((c) => c.id === draft.categoryId)?.icon)
                    : Tag
                }
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
                text={accounts.find((a) => a.id === draft.accountId)?.name ?? 'Elegir cuenta'}
                icon={CreditCard}
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
              <span className="relative inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-[7px] text-[13.5px] font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint-ink">
                <Calendar aria-hidden="true" className="size-[15px]" strokeWidth={1.9} />
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
                  className="absolute inset-0 size-full cursor-pointer opacity-0 outline-none"
                />
              </span>
            </div>

            {hint && !error && (
              <p className="text-[13px] font-semibold text-[#8a5a00] dark:text-gold">{hint}</p>
            )}
            {error && (
              <p role="alert" className="text-[13px] font-semibold text-expense">
                {error}
              </p>
            )}
            {drafts.length === 1 && cardFooter}
          </li>
        )
      })}
    </ul>
  )
}
