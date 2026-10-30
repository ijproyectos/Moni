// Small building blocks repeated across the redesigned screens (designs/ folder).
import { Check, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import mascotDefault from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import { avatarColor } from './avatarColor'
import { cn } from './cn'
import { useMyInitial } from './myInitialContext'

/** Uppercase spaced label above form fields and list sections ("¿CUÁNTO NECESITÁS?"). */
export function SectionLabel({
  children,
  action,
  className,
  tone = 'muted',
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
  tone?: 'muted' | 'dark'
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <p
        className={cn(
          'text-[13px] font-extrabold uppercase tracking-[0.1em]',
          tone === 'muted' ? 'text-text-muted' : 'text-ink',
        )}
      >
        {children}
      </p>
      {action}
    </div>
  )
}

/** Thin rounded progress bar. `value` is 0..1. */
export function ProgressBar({
  value,
  tone = 'light',
  className,
  label,
}: {
  value: number
  tone?: 'light' | 'dark'
  className?: string
  label?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        'h-2.5 overflow-hidden rounded-full',
        tone === 'dark' ? 'bg-surface' : 'bg-sand',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full', tone === 'dark' ? 'bg-lime' : 'bg-forest')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Two-tone bar (forest + lime) used for "Vos 60% · Caro 40%" splits. `share` is the first part, 0..1. */
export function SplitBar({
  share,
  className,
  rest = 'lime',
}: {
  share: number
  className?: string
  /** Color of the second part. */
  rest?: 'lime' | 'blush'
}) {
  return (
    <div
      className={cn(
        'flex h-3 overflow-hidden rounded-full',
        rest === 'lime' ? 'bg-lime' : 'bg-blush',
        className,
      )}
      aria-hidden="true"
    >
      <div className="h-full rounded-full bg-forest" style={{ width: `${share * 100}%` }} />
    </div>
  )
}

/** Gold coin-with-hole glyph used next to "Sugerido". */
export function MoniGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-6 shrink-0', className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <rect
        x="8.5"
        y="8.5"
        width="7"
        height="7"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  )
}

/** Light-lime callout: "Sugerido: …". */
export function MoniSays({
  children,
  lead = 'Sugerido:',
  className,
  icon,
}: {
  children: ReactNode
  lead?: string | null
  className?: string
  icon?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[18px] bg-lime/30 px-4 py-3 text-[16px] leading-[22px] text-ink',
        className,
      )}
    >
      {icon ?? <MoniGlyph className="mt-0.5" />}
      <p>
        {lead && <strong className="font-extrabold">{lead}</strong>} {children}
      </p>
    </div>
  )
}

/** Dark "MONI CALCULA" card with the mascot on a cream tile. */
export function MoniCalcCard({
  title,
  children,
  label = 'Moni calcula',
  mascot = mascotDefault,
  tone = 'dark',
  className,
}: {
  title: ReactNode
  children?: ReactNode
  label?: string
  mascot?: string
  tone?: 'dark' | 'light'
  className?: string
}) {
  const dark = tone === 'dark'
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-[24px] p-3',
        dark ? 'bg-forest text-cream' : 'border border-sand bg-card text-ink',
        className,
      )}
    >
      <span className="flex h-[92px] w-[110px] shrink-0 items-center justify-center rounded-[16px] bg-cream">
        <img src={mascot} alt="" className="h-[80px] w-auto" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[13px] font-extrabold uppercase tracking-[0.1em]',
            dark ? 'text-lime' : 'text-text-muted',
          )}
        >
          {label}
        </p>
        <p className="font-display text-[24px] font-extrabold leading-7">{title}</p>
        {children && (
          <div
            className={cn(
              'mt-0.5 text-[15px] leading-5',
              dark ? 'text-text-muted-on-dark' : 'text-text-muted',
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/** Rounded pill used for single/multi choice ("3 meses", "Cuenta sueldo"). */
export function ChoiceChip({
  selected,
  icon: Icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 px-5 text-[17px] font-extrabold transition',
        selected ? 'border-ink bg-forest text-cream' : 'border-sand bg-card text-ink',
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="size-5" strokeWidth={2} />}
      {children}
    </button>
  )
}

/** Dashed outline button ("+ Agregar otra opción"). */
export function DashedButton({
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'flex min-h-14 w-full items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-line text-[17px] font-extrabold text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/** On/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-8 w-14 shrink-0 rounded-full transition',
        checked ? 'bg-lime' : 'bg-track',
      )}
    >
      <span
        className={cn(
          'absolute top-1 size-6 rounded-full transition-all',
          checked ? 'left-7 bg-forest' : 'left-1 bg-white',
        )}
      />
    </button>
  )
}

/** Square-ish tinted tile holding an icon. */
export function IconTile({
  icon: Icon,
  bg = '#e3f2cf',
  color = '#064735',
  shape = 'circle',
  className,
}: {
  icon: LucideIcon
  bg?: string
  color?: string
  shape?: 'circle' | 'square'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-12 shrink-0 items-center justify-center',
        shape === 'circle' ? 'rounded-full' : 'rounded-[16px]',
        className,
      )}
      style={{ backgroundColor: bg, color }}
    >
      <Icon className="size-[22px]" strokeWidth={2} />
    </span>
  )
}

/** Person initial bubble ("J", "C"). */
export function Avatar({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const myInitial = useMyInitial()
  const initial = name === 'Vos' ? myInitial : name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-extrabold text-ink',
        size === 'sm' && 'size-8 text-[14px]',
        size === 'md' && 'size-12 text-[18px]',
        size === 'lg' && 'size-14 text-[22px]',
        className,
      )}
      style={{ backgroundColor: color ?? avatarColor(name) }}
    >
      {initial}
    </span>
  )
}

interface OptionRowProps {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  className?: string
  chevron?: boolean
}

/** White bordered card row: icon, title/subtitle, trailing content or chevron. Link or button. */
export function OptionRow({
  icon,
  title,
  subtitle,
  trailing,
  to,
  onClick,
  className,
  chevron = Boolean(to || onClick),
}: OptionRowProps) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[17px] font-extrabold leading-6 text-ink">{title}</span>
        {subtitle && (
          <span className="block text-[14px] leading-5 text-text-muted">{subtitle}</span>
        )}
      </span>
      {trailing}
      {chevron && (
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink" strokeWidth={2.25} />
      )}
    </>
  )
  const cls = cn(
    'flex min-h-[72px] w-full items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3',
    className,
  )
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

/** Round radio/check indicator used in selectable lists. */
export function CheckDot({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
        checked ? 'border-ink bg-forest text-lime' : 'border-line bg-card',
        className,
      )}
    >
      {checked && <Check className="size-4" strokeWidth={3} />}
    </span>
  )
}

/** Plain white card with the design's border and radius. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[24px] border border-sand bg-card p-4', className)}>{children}</div>
  )
}

/** Lime circular "+" used in page headers. */
export function HeaderAddButton({
  label,
  onClick,
  to,
}: {
  label: string
  onClick?: () => void
  to?: string
}) {
  const cls =
    'flex size-14 shrink-0 items-center justify-center rounded-full bg-lime text-forest shadow-sm'
  const icon = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
  return to ? (
    <Link to={to} aria-label={label} className={cls}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {icon}
    </button>
  )
}

/** Page body wrapper with the standard gutters for second-level screens. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('flex flex-col gap-4 px-4 pt-14', className)}>{children}</section>
}
