import { formatArs } from '@/shared/lib/money'
import { ProgressBar } from '@/shared/ui/kit'
import { cn } from '@/shared/ui/cn'

interface SavingsHeroProps {
  label: string
  savedCents: number
  targetCents: number
  progressValue: number
  footer?: React.ReactNode
  aside?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/** Dark summary card: label, big saved amount "de $X", progress bar and footer. */
export function SavingsHero({
  label,
  savedCents,
  targetCents,
  progressValue,
  footer,
  aside,
  children,
  className,
}: SavingsHeroProps) {
  return (
    <section className={cn('rounded-[28px] bg-forest px-5 pb-5 pt-5 text-cream', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          {label}
        </p>
        {aside}
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[38px] font-extrabold leading-[48px]">
          {formatArs(savedCents)}
        </span>
        <span className="text-[15px] text-text-muted-on-dark">de {formatArs(targetCents)}</span>
      </p>
      <ProgressBar value={progressValue} tone="dark" className="mt-3" label="Avance" />
      {footer && <div className="mt-2 text-[15px] text-text-muted-on-dark">{footer}</div>}
      {children}
    </section>
  )
}
