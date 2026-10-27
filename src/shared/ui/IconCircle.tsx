import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { getCategoryIcon, tint } from './categoryIcons'

interface IconCircleProps {
  icon: LucideIcon
  /** Hex color; the circle is tinted lightly and the icon uses the full color. */
  color?: string
  className?: string
}

export function IconCircle({ icon: Icon, color = '#064735', className }: IconCircleProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', className)}
      style={{ backgroundColor: tint(color), color }}
    >
      <Icon className="size-5" strokeWidth={2} />
    </span>
  )
}

/** Icon circle resolved from a stored category icon name. */
export function CategoryIconCircle({
  iconName,
  color,
  className,
}: {
  iconName: string | null | undefined
  color?: string | null
  className?: string
}) {
  return (
    <IconCircle icon={getCategoryIcon(iconName)} color={color ?? undefined} className={className} />
  )
}
