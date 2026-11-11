import type { ReactNode } from 'react'
import { cn } from './cn'

export type StatusChipTone = 'ok' | 'warn' | 'bad'

const toneClasses: Record<StatusChipTone, string> = {
  ok: 'bg-ok-bg text-ok-ink',
  warn: 'bg-warn-bg text-warn-ink',
  bad: 'bg-bad-bg text-bad-ink',
}

interface StatusChipProps {
  tone: StatusChipTone
  /** Always required: the state is never conveyed by color alone. */
  children: ReactNode
  className?: string
}

/** Financial state pill ("Vas bien", "Ajustado", "Te pasaste"): color plus a dot plus text. */
export function StatusChip({ tone, children, className }: StatusChipProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />
      {children}
    </span>
  )
}
