import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** Tailwind classes applied when this segment is active (e.g. blush for expenses). */
  activeClassName?: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  label: string
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-1 rounded-full bg-sand p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-12 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 font-display text-[clamp(13px,4.2vw,16px)] font-extrabold transition disabled:cursor-default min-[360px]:px-2',
              active ? (option.activeClassName ?? 'bg-forest text-cream') : 'text-text-muted',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
