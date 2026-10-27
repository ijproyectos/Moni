import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

interface MovementRowProps {
  leading: ReactNode
  title: string
  subtitle?: string
  /** Right-aligned content, usually an `AmountDisplay`. */
  trailing?: ReactNode
  /** Makes the whole content area a button (e.g. open the edit sheet). */
  onPress?: () => void
  pressLabel?: string
  onDelete?: () => void
  deleteLabel?: string
  className?: string
}

/** One list row: icon circle, title/subtitle, amount and an optional trash button. */
export function MovementRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  pressLabel,
  onDelete,
  deleteLabel = 'Eliminar',
  className,
}: MovementRowProps) {
  const content = (
    <>
      {leading}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-display text-[17px] font-semibold leading-6 text-forest">
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-sm leading-5 text-text-muted">{subtitle}</span>
        )}
      </span>
      {trailing && (
        <span className="shrink-0 font-display text-[17px] font-semibold">{trailing}</span>
      )}
    </>
  )
  const contentClass = 'flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left'

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {onPress ? (
        <button type="button" onClick={onPress} aria-label={pressLabel} className={contentClass}>
          {content}
        </button>
      ) : (
        <div className={contentClass}>{content}</div>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={deleteLabel}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-expense"
        >
          <Trash2 aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
