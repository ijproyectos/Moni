import type { CategorySlice } from '../domain/monthSummary'
import { donutArcs } from '../domain/donut'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'

const RADIUS = 70
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const LEGEND_SIZE = 5

interface CategoryDonutProps {
  slices: readonly CategorySlice[]
  totalCents: number
}

/** Hand-made SVG donut: category colors, total in the center, top 4 in the legend. */
export function CategoryDonut({ slices, totalCents }: CategoryDonutProps) {
  const sorted = [...slices].sort((a, b) => b.amountCents - a.amountCents)
  const arcs = donutArcs(
    sorted.map((s) => s.amountCents),
    CIRCUMFERENCE,
  )

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[150px] shrink-0">
        <svg
          viewBox="0 0 176 176"
          className="size-full -rotate-90"
          role="img"
          aria-label="Gastos por categoría"
        >
          <circle cx="88" cy="88" r={RADIUS} fill="none" stroke="#f3e8d2" strokeWidth="26" />
          {sorted.map((slice, i) => {
            const arc = arcs[i]
            if (!arc || arc.length <= 0) return null
            return (
              <circle
                key={slice.categoryId}
                cx="88"
                cy="88"
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth="26"
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xs font-extrabold uppercase tracking-wider text-text-muted">
            Total
          </span>
          <AmountDisplay
            cents={totalCents}
            className="font-display text-lg font-extrabold text-forest"
          />
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-2.5" aria-label="Categorías principales">
        {sorted.slice(0, LEGEND_SIZE).map((slice) => (
          <li key={slice.categoryId} className="flex items-center gap-2 text-[16px]">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-forest">{slice.name}</span>
            <span className="font-display font-extrabold text-forest">
              {Math.round(slice.percent)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
