import { cn } from '@/shared/ui/cn'
import { budgetBadge, type BudgetStatus } from '../domain/budget'

const TONE = {
  ok: 'bg-sand text-ink',
  warning: 'bg-gold/45 text-ink',
  over: 'bg-[#fbdcd7] text-[#b8321f]',
} as const

/** Small pill shown next to a category that has a monthly limit. */
export function BudgetBadge({ budget, className }: { budget: BudgetStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[13px] font-extrabold',
        TONE[budget.state],
        className,
      )}
    >
      {budgetBadge(budget)}
    </span>
  )
}
