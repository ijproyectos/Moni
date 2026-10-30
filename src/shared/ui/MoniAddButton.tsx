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
        'relative -my-3 h-[88px] w-[76px] shrink-0 select-none rounded-[32px] transition-transform active:scale-95',
        className,
      )}
      {...props}
    >
      <MoniCat
        phase={phase}
        className="pointer-events-none absolute -top-4 left-1/2 w-[123px] -translate-x-1/2 drop-shadow-[0_3px_3px_rgba(0,0,0,0.25)]"
      />
    </button>
  )
}
