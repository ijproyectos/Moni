import { themedColor } from '@/shared/ui/categoryIcons'
import { donutArcs } from '../domain/donut'
import type { LegendSlice } from '../domain/stats'

const SIZE = 150
const RADIUS = 60
const STROKE = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function colorOf(slice: LegendSlice): string {
  return slice.color ? themedColor(slice.color) : 'var(--color-mint-soft)'
}

/** Donut of the Menta design: 150px, 18px ring, biggest share in the middle, legend with top 4 + "Otras N". */
export function CategoryDonut({ slices }: { slices: readonly LegendSlice[] }) {
  const arcs = donutArcs(
    slices.map((s) => s.amountCents),
    CIRCUMFERENCE,
  )
  const top = slices[0]
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-4">
      <div className="relative size-[150px]">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label={`Gastos por categoría: ${slices.map((s) => `${s.name} ${Math.round(s.percent)}%`).join(', ')}`}
        >
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-sand)" strokeWidth={STROKE} />
          {slices.map((slice, i) => {
            const arc = arcs[i]
            if (!arc || arc.length <= 0) return null
            return (
              <circle
                key={slice.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={colorOf(slice)}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
              />
            )
          })}
        </svg>
        {top && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
            <span className="text-[22px] font-bold">{Math.round(top.percent)}%</span>
            <span className="max-w-full truncate text-[11.5px] text-text-muted">{top.name}</span>
          </div>
        )}
      </div>
      <ul className="flex min-w-0 flex-col gap-2" aria-label="Categorías principales">
        {slices.map((slice) => (
          <li key={slice.id} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[13px]">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: colorOf(slice) }} />
            <span className="truncate">{slice.name}</span>
            <span className="font-bold">{Math.round(slice.percent)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
