import type { ElementType, ReactNode } from 'react'
import { cn } from './cn'

interface KickerProps {
  children: ReactNode
  as?: ElementType
  className?: string
}

/** Small uppercase label above a figure or section (11.5px / 600 / tracking .12em), in the secondary text color. */
export function Kicker({ children, as: Tag = 'p', className }: KickerProps) {
  return (
    <Tag className={cn('text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-muted', className)}>
      {children}
    </Tag>
  )
}
