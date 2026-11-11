import { cn } from './cn'

interface ProgressRingProps {
  /** 0..1; anything outside is clamped. */
  value: number
  /** Text in the middle (usually the percentage). */
  label: string
  size?: number
  stroke?: number
  className?: string
}

/** Circular progress of the Menta design: line track, mint-ink arc that starts at the top, label in the middle. */
export function ProgressRing({ value, label, size = 64, stroke = 7, className }: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        <circle
          data-testid="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${clamped * circumference} ${circumference}`}
          className={clamped === 0 ? 'stroke-mint-soft' : 'stroke-mint-ink'}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold">
        {label}
      </span>
    </div>
  )
}
