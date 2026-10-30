import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'
import { readableOn } from './categoryIcons'

interface CategoryChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  label: string
  icon?: LucideIcon
  /** Category color. On the light surface a selected chip is filled with it. */
  color?: string
  selected?: boolean
  surface?: 'light' | 'dark'
  /** Small colored dot before the label (expense red / income green legend). */
  dot?: string
}

export function CategoryChip({
  label,
  icon: Icon,
  color,
  selected = false,
  surface = 'light',
  dot,
  className,
  style,
  type = 'button',
  ...props
}: CategoryChipProps) {
  const filled = surface === 'light' && selected && color
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 rounded-full border-2 px-4 py-1.5 font-display text-base font-semibold leading-5 transition',
        surface === 'light' &&
          (selected ? 'border-transparent bg-forest text-cream' : 'border-cream bg-card text-ink'),
        surface === 'dark' &&
          (selected
            ? 'border-transparent bg-cream text-forest'
            : 'border-lime/30 bg-transparent text-cream'),
        className,
      )}
      style={filled ? { backgroundColor: color, color: readableOn(color), ...style } : style}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {Icon && <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2} />}
      {/* Long custom names wrap inside the chip instead of pushing it past the screen edge. */}
      <span className="min-w-0 text-left [overflow-wrap:anywhere]">{label}</span>
    </button>
  )
}
