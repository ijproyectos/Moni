import { useState, type ButtonHTMLAttributes, type Ref } from 'react'
import { cn } from './cn'
import { MoniCat } from './MoniCat'

interface MoniAddButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The menu is open: the button takes the mint border and the cat raises its paw and a coin pops up. */
  open?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * The assistant button of the bottom bar: a lilac circle (60px, white 3px border) with Moni's cat. Tapping it opens
 * and closes the add menu. It only moves when it is touched.
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
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        'relative flex size-[60px] shrink-0 select-none items-center justify-center rounded-full border-[3px] bg-lilac outline-none',
        open ? 'border-mint-ink' : 'border-white',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink',
        'motion-safe:transition motion-safe:active:scale-[0.97] active:brightness-95',
        className,
      )}
      {...props}
    >
      <MoniCat phase={phase} className="pointer-events-none w-[46px]" />
    </button>
  )
}
