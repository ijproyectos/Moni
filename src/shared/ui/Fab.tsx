import { Plus } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export function Fab({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'flex size-16 shrink-0 items-center justify-center rounded-full bg-lime text-forest shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
      {...props}
    >
      <Plus aria-hidden="true" className="size-8" strokeWidth={2.25} />
    </button>
  )
}
