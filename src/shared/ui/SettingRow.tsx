import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from './cn'

interface SettingRowProps {
  icon: ReactNode
  title: string
  subtitle?: ReactNode
  /** Right side: a value, a switch, swatches. */
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  className?: string
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

/** Row of a settings card (Perfil): 38px round icon, title 15/500, a trailing value and a chevron when it leads somewhere. */
export function SettingRow({
  icon,
  title,
  subtitle,
  trailing,
  to,
  onClick,
  className,
}: SettingRowProps) {
  const leads = Boolean(to || onClick)
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-sand text-ink"
      >
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        {subtitle && <span className="block text-[12px] leading-4 text-text-muted">{subtitle}</span>}
      </span>
      <span className="flex items-center gap-1.5 text-[13px] text-text-muted">
        {trailing}
        {leads && <ChevronRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />}
      </span>
    </>
  )
  const cls = cn(
    'grid min-h-[54px] w-full grid-cols-[38px_1fr_auto] items-center gap-3 py-2',
    (to || onClick) && FOCUS,
    className,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

/** Card that holds SettingRows: white, 26px radius, hairline dividers. */
export function SettingCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('divide-y divide-line rounded-[26px] bg-card px-4 py-0.5', className)}>
      {children}
    </div>
  )
}
