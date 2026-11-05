import { Plus, X } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type Ref } from 'react'
import { cn } from './cn'
import { MoniCat } from './MoniCat'

interface MoniAddButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The menu is open: the cat raises its paw and a coin pops up. */
  open?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * The center button of the bottom bar: Moni's cat, and nothing else. It is the whole button (no circle, no plus), so
 * tapping the cat opens and closes the menu. It only moves when it is touched.
 */
export function MoniAddButton({
  open = false,
  className,
  type = 'button',
  ...props
}: MoniAddButtonProps) {
  const [wasOpen, setWasOpen] = useState(open)
  const [phase, setPhase] = useState<'open' | 'close'>()
  if (open !== wasOpen) {
    setWasOpen(open)
    setPhase(open ? 'open' : 'close')
  }
  return (
    <button
      type={type}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        'relative -mt-7 mb-0 size-[72px] shrink-0 select-none rounded-full bg-forest shadow-[0_8px_18px_rgba(16,48,30,0.28)] transition-transform active:scale-95 dark:ring-1 dark:ring-white/15',
        className,
      )}
      {...props}
    >
      <MoniCat
        phase={phase}
        className="pointer-events-none absolute left-1/2 top-[14px] w-[68px] -translate-x-1/2"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border-2 border-card bg-lime text-ink"
      >
        {open ? (
          <X className="size-3.5" strokeWidth={3} />
        ) : (
          <Plus className="size-3.5" strokeWidth={3} />
        )}
      </span>
    </button>
  )
}
