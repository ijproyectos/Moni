import { Trash2 } from 'lucide-react'
import type { Account } from '@/features/accounts/domain/account'
import type { Category } from '@/features/categories/domain/category'
import { formatArs } from '@/shared/lib/money'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { cn } from '@/shared/ui/cn'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { needsReview, type DraftMovement } from '../domain/draft'

interface MovementDraftListProps {
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

const fieldClass =
  'h-12 w-full rounded-[14px] border border-sand bg-white px-3 text-[16px] text-forest placeholder:text-text-muted'

/** Confirmation list: every parsed movement is editable before anything is saved. */
export function MovementDraftList({
  drafts,
  categories,
  accounts,
  today,
  errors,
  disabled = false,
  onChange,
  onRemove,
}: MovementDraftListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {drafts.map((draft, index) => {
        const n = index + 1
        const review = needsReview(draft)
        const cents = parseAmountInput(draft.amount)
        const options = categories.filter((c) => c.kind === draft.kind)
        const error = errors[draft.key]
        return (
          <li
            key={draft.key}
            aria-label={`Movimiento ${n}`}
            className={cn(
              'rounded-[22px] border-2 bg-white p-3',
              review ? 'border-gold' : 'border-sand',
            )}
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
                      onChange(draft.key, {
                        kind,
                        categoryId: kind === draft.kind ? draft.categoryId : '',
                      })
                    }
                    className={cn(
                      'min-h-11 rounded-full px-4 font-display text-[15px] font-extrabold',
                      draft.kind === kind
                        ? kind === 'expense'
                          ? 'bg-blush text-forest'
                          : 'bg-lime text-forest'
                        : 'bg-sand text-text-muted',
                    )}
                  >
                    {kind === 'expense' ? 'Gasto' : 'Ingreso'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={`Quitar movimiento ${n}`}
                disabled={disabled}
                onClick={() => onRemove(draft.key)}
                className="flex size-11 items-center justify-center rounded-full bg-sand text-forest"
              >
                <Trash2 aria-hidden="true" className="size-5" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_1.4fr] gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                  Monto
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={`Monto del movimiento ${n}`}
                  value={draft.amount}
                  disabled={disabled}
                  onChange={(e) => onChange(draft.key, { amount: e.target.value })}
                  className={cn(fieldClass, 'font-display font-extrabold')}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                  Nota
                </span>
                <input
                  type="text"
                  aria-label={`Nota del movimiento ${n}`}
                  value={draft.note}
                  maxLength={200}
                  disabled={disabled}
                  onChange={(e) => onChange(draft.key, { note: e.target.value })}
                  className={fieldClass}
                />
              </label>
            </div>
            {cents !== null && cents > 0 && (
              <p className="mt-1 text-[13px] text-text-muted">
                {draft.kind === 'expense' ? 'Salen ' : 'Entran '}
                {formatArs(cents)}
              </p>
            )}

            <div
              role="group"
              aria-label={`Categoría del movimiento ${n}`}
              className="mt-2 flex flex-wrap gap-2"
            >
              {options.map((c) => (
                <CategoryChip
                  key={c.id}
                  label={c.name}
                  icon={getCategoryIcon(c.icon)}
                  color={c.color}
                  selected={draft.categoryId === c.id}
                  disabled={disabled}
                  onClick={() => onChange(draft.key, { categoryId: c.id })}
                />
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                  Cuenta
                </span>
                <select
                  aria-label={`Cuenta del movimiento ${n}`}
                  value={draft.accountId}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(draft.key, { accountId: e.target.value, accountUnmatched: false })
                  }
                  className={fieldClass}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                  Fecha
                </span>
                <input
                  type="date"
                  aria-label={`Fecha del movimiento ${n}`}
                  value={draft.occurredOn}
                  max={today}
                  disabled={disabled}
                  onChange={(e) => onChange(draft.key, { occurredOn: e.target.value })}
                  className={fieldClass}
                />
              </label>
            </div>

            {review && !error && (
              <p className="mt-2 rounded-[12px] bg-gold/25 px-3 py-2 text-[14px] leading-5">
                {draft.categoryId === ''
                  ? 'Elegí una categoría para este movimiento.'
                  : draft.accountUnmatched
                    ? 'No encontré la cuenta que nombraste, así que usé la principal. Revisá la cuenta antes de guardar.'
                    : 'No estoy segura de este, revisalo antes de guardar.'}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-[14px] font-semibold text-expense">
                {error}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
