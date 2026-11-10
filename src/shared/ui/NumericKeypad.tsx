import { Delete } from 'lucide-react'
import type { AmountKey } from '@/shared/lib/amountInput'
import { cn } from './cn'
import { FOCUS_RING } from './focusRing'

const KEYS: readonly AmountKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back']

/**
 * On-screen numeric keypad (3 x 4) for an amount field. It only reports keys; the field keeps its own text, so the
 * physical keyboard keeps working. The keys are out of the Tab order on purpose: the amount field is the keyboard path.
 */
export function NumericKeypad({
  onKey,
  disabled = false,
  className,
}: {
  onKey: (key: AmountKey) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div role="group" aria-label="Teclado numérico" className={cn('grid grid-cols-3 gap-1.5', className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={key === 'back' ? 'Borrar' : key === ',' ? 'Coma decimal' : undefined}
          onClick={() => onKey(key)}
          className={cn(
            'flex h-[46px] items-center justify-center rounded-2xl bg-card font-display text-[21px] font-semibold text-ink transition active:brightness-95 disabled:opacity-60',
            FOCUS_RING,
          )}
        >
          {key === 'back' ? <Delete aria-hidden="true" className="size-5" strokeWidth={2} /> : key}
        </button>
      ))}
    </div>
  )
}
