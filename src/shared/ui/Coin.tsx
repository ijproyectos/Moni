import { cn } from './cn'

/** Decorative gold coin used around the mascot. Variant "hole" mirrors the logo's square-hole coin. */
export function Coin({
  variant = 'dollar',
  className,
}: {
  variant?: 'dollar' | 'hole'
  className?: string
}) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn('text-gold', className)}>
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="currentColor"
        stroke="var(--color-category-outings)"
        strokeWidth="4"
      />
      {variant === 'dollar' ? (
        <text
          x="20"
          y="27"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="700"
          fontSize="20"
          fill="var(--color-forest)"
        >
          $
        </text>
      ) : (
        <rect
          x="14"
          y="14"
          width="12"
          height="12"
          rx="2"
          fill="none"
          stroke="var(--color-forest)"
          strokeWidth="4"
        />
      )}
    </svg>
  )
}
