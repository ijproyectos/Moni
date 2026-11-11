import { cn } from './cn'
import { FOCUS_RING } from './focusRing'

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
  /** `menta`: the grid pill of the Menta design (mint when active). */
  variant?: 'classic' | 'menta'
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  variant = 'classic',
}: SegmentedControlProps<T>) {
  const menta = variant === 'menta'
  return (
    <div
      role="group"
      aria-label={label}
      style={menta ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
      className={cn(
        menta ? 'grid shrink-0 rounded-full bg-seg-track p-1' : 'flex gap-1 rounded-full bg-tint-green p-1',
        className,
      )}
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
              menta
                ? cn(
                    'min-w-0 whitespace-nowrap rounded-full py-[9px] text-center font-display text-[14px] font-semibold transition disabled:cursor-default',
                    FOCUS_RING,
                    active ? 'bg-mint text-white' : 'text-[#4F6157] dark:text-text-muted',
                  )
                : cn(
                    'min-h-12 min-w-0 flex-1 whitespace-nowrap rounded-full px-1 font-display text-[clamp(13px,4.2vw,16px)] font-extrabold transition disabled:cursor-default min-[360px]:px-2',
                    active
                      ? (option.activeClassName ??
                          'bg-card text-ink shadow-[0_1px_3px_rgb(16_48_30/0.18)] dark:bg-forest dark:text-cream')
                      : 'text-text-muted',
                  ),
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
