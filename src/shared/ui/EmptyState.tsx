import type { ReactNode } from 'react'
import { cn } from './cn'

interface EmptyStateProps {
  mascotUrl: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ mascotUrl, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}>
      <img src={mascotUrl} alt="" className="size-32" />
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      {description && (
        <p className="max-w-[28ch] text-[15px] leading-[22px] text-text-muted">{description}</p>
      )}
      {action && <div className="mt-2 w-full max-w-[280px]">{action}</div>}
    </div>
  )
}
