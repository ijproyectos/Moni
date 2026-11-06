import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { themedColor } from '@/shared/ui/categoryIcons'
import type { CategorySlice } from '../domain/monthSummary'

const LIST_SIZE = 8

/** One stacked bar with every category of the month and the biggest ones listed under it (real percentages and amounts). */
export function SpendingBreakdown({ slices }: { slices: readonly CategorySlice[] }) {
  const sorted = [...slices]
    .filter((s) => s.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents)
  return (
    <div>
      <div
        role="img"
        aria-label="Gastos por categoría"
        className="mx-5 flex h-4 gap-0.5 overflow-hidden rounded-[4px]"
      >
        {sorted.map((slice) => (
          <span
            key={slice.categoryId}
            style={{ flexGrow: slice.amountCents, backgroundColor: themedColor(slice.color) }}
            className="min-w-1"
          />
        ))}
      </div>
      <ul
        className="mt-3 divide-y divide-line border-y border-line"
        aria-label="Categorías principales"
      >
        {sorted.slice(0, LIST_SIZE).map((slice) => (
          <li key={slice.categoryId} className="flex min-h-12 items-center gap-3 px-5 text-[16px]">
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-[4px]"
              style={{ backgroundColor: themedColor(slice.color) }}
            />
            <span className="min-w-0 flex-1 truncate text-ink">{slice.name}</span>
            <span className="text-[14px] text-text-muted">{Math.round(slice.percent)}%</span>
            <AmountDisplay
              cents={-slice.amountCents}
              className="min-w-[84px] text-right font-display font-extrabold text-ink"
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
