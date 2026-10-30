import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * A conversation bubble with a small tip. `tip` says where it points: "down" for a bubble above the cat, "up" for one below
 * it. `from="moni"` is the cat talking (card surface); `from="you"` is what the person said (a soft lime).
 */
export function SpeechBubble({
  children,
  tip,
  from = 'moni',
  className,
  ...rest
}: {
  children: ReactNode
  tip: 'up' | 'down'
  from?: 'moni' | 'you'
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const fill = from === 'moni' ? 'bg-card' : 'bg-[#eaf8d2] dark:bg-[#24402f]'
  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn('rounded-[26px] px-4 py-3 text-[17px] leading-6 text-ink ring-1 ring-sand', fill)}
        {...rest}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-1/2 size-3.5 -translate-x-1/2 rotate-45 ring-1 ring-sand',
          fill,
          tip === 'down'
            ? '-bottom-[6px] [clip-path:polygon(100%_0,100%_100%,0_100%)]'
            : '-top-[6px] [clip-path:polygon(0_0,100%_0,0_100%)]',
        )}
      />
    </div>
  )
}
