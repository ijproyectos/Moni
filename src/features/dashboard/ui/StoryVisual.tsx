import { Star } from 'lucide-react'
import type { StoryVisual as Visual } from '../domain/stories'

/** The chart of a slide, drawn from real figures: progress bar, horizontal bars or the badge. Decorative bars are hidden
 *  from screen readers; the same data is spoken through the amounts' text. */
export function StoryVisual({ visual, accent }: { visual: Visual; accent: string }) {
  if (visual.kind === 'progress') {
    const pct = Math.round(Math.min(1, Math.max(0, visual.value)) * 100)
    return (
      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={visual.caption ?? 'Avance'}
          className="h-5 overflow-hidden rounded-full bg-white/20"
        >
          <span
            className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700"
            style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: accent }}
          />
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[14px] font-semibold">
          <span className="opacity-90">{visual.caption}</span>
          <span className="font-extrabold tabular-nums">{pct}%</span>
        </div>
      </div>
    )
  }
  if (visual.kind === 'bars') {
    return (
      <ul className="flex flex-col gap-3">
        {visual.rows.map((row) => (
          <li key={row.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-[15px] font-bold">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 tabular-nums">{row.amount}</span>
            </div>
            <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700"
                style={{ width: `${Math.max(row.share * 100, 4)}%`, backgroundColor: accent }}
              />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <span
        aria-hidden="true"
        className="flex size-28 items-center justify-center rounded-full"
        style={{ backgroundColor: accent, color: '#35266F' }}
      >
        <Star className="size-14" fill="currentColor" strokeWidth={1.5} />
      </span>
      <p className="text-center font-display text-[28px] font-extrabold leading-tight">{visual.name}</p>
    </div>
  )
}
