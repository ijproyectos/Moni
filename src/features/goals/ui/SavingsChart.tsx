import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatCompact, formatArs } from '@/shared/lib/money'
import { shiftMonth, type IsoDate } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import type { MonthPoint } from '../domain/savingsPlan'
import { monthShort, monthTitle, swipeShift, WINDOW_MONTHS } from './chartMonths'

/** How many months the side buttons move. */
const BUTTON_STEP = 3
/** Pixels of horizontal drag that count as a swipe, and the vertical room that still counts as horizontal. */
const SWIPE_START_PX = 10
const WHEEL_STEP_PX = 60
const PLOT_HEIGHT = 132

function barHeight(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  // Proportional to the shared scale; a tiny positive amount still shows a sliver so it is not mistaken for zero.
  return Math.max(3, Math.round((value / max) * PLOT_HEIGHT))
}

interface SavingsChartProps {
  /** The months in the window, in order. */
  points: readonly MonthPoint[]
  /** One shared scale for every bar (the tallest amount over the range that matters). */
  max: number
  selected: IsoDate
  currentMonth: IsoDate
  onSelect: (month: IsoDate) => void
  /** Moves the window by whole months (negative = earlier). Selecting is the caller's business. */
  onShift: (months: number) => void
  onToday: () => void
}

/**
 * Vertical bars month by month: a solid bar for what was really saved and a dashed one for what the plan asked for.
 * Months never stay put: swipe (touch), drag or trackpad (mouse), the arrow buttons or the keyboard move the window
 * through any period. Vertical scrolling of the page keeps working (the plot only claims horizontal gestures).
 */
export function SavingsChart({
  points,
  max,
  selected,
  currentMonth,
  onSelect,
  onShift,
  onToday,
}: SavingsChartProps) {
  const plot = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const [offset, setOffset] = useState(0)
  const wheel = useRef(0)
  const focusMonth = useRef<IsoDate | null>(null)
  const first = points[0]?.month ?? currentMonth
  const last = points[points.length - 1]?.month ?? currentMonth
  const showToday = currentMonth < first || currentMonth > last

  const columnWidth = () => (plot.current ? plot.current.clientWidth / WINDOW_MONTHS : 0)

  // Trackpad / mouse wheel: a horizontal intent moves the months; a vertical one scrolls the page as usual. Registered
  // by hand because React's wheel listener is passive and cannot stop the browser's own back/forward swipe.
  useEffect(() => {
    const el = plot.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      wheel.current += event.deltaX
      const steps = Math.trunc(wheel.current / WHEEL_STEP_PX)
      if (steps !== 0) {
        wheel.current -= steps * WHEEL_STEP_PX
        onShift(steps)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onShift])

  // After the arrow keys move the selection, keep the keyboard focus on that month's column.
  useEffect(() => {
    if (!focusMonth.current) return
    const target = plot.current?.querySelector<HTMLElement>(`[data-month="${focusMonth.current}"]`)
    target?.focus()
    focusMonth.current = null
  })

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, moved: false }
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current
    if (!state) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (!state.moved) {
      if (Math.abs(dx) < SWIPE_START_PX || Math.abs(dx) < Math.abs(dy)) return
      state.moved = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    const width = columnWidth()
    setOffset(Math.max(-width * 2, Math.min(width * 2, dx)))
  }

  function endDrag(event: React.PointerEvent) {
    const state = drag.current
    drag.current = null
    if (!state?.moved) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const shift = swipeShift(event.clientX - state.x, columnWidth())
    setOffset(0)
    // The release of a drag must not also count as a tap on the month under the finger.
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 0)
    if (shift !== 0) onShift(shift)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const move = (months: number) => {
      event.preventDefault()
      const next = shiftMonth(selected, months)
      focusMonth.current = next
      onSelect(next)
      if (next < first) onShift(-1)
      else if (next > last) onShift(1)
    }
    if (event.key === 'ArrowLeft') move(-1)
    else if (event.key === 'ArrowRight') move(1)
    else if (event.key === 'PageUp') {
      event.preventDefault()
      onShift(-WINDOW_MONTHS)
    } else if (event.key === 'PageDown') {
      event.preventDefault()
      onShift(WINDOW_MONTHS)
    } else if (event.key === 'Home') {
      event.preventDefault()
      onToday()
    }
  }

  const rangeLabel = `${monthShort(first)} ${first.slice(0, 4)} – ${monthShort(last)} ${last.slice(0, 4)}`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Meses anteriores"
          onClick={() => onShift(-BUTTON_STEP)}
          className="flex size-10 items-center justify-center rounded-full border border-line bg-card"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <p aria-live="polite" className="text-[14px] font-extrabold capitalize text-text-muted">
          {rangeLabel}
        </p>
        <button
          type="button"
          aria-label="Meses siguientes"
          onClick={() => onShift(BUTTON_STEP)}
          className="flex size-10 items-center justify-center rounded-full border border-line bg-card"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>

      <div
        ref={plot}
        role="group"
        aria-label="Ahorro por mes. Deslizá para ver otros meses"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(event) => {
          if (justDragged.current) {
            event.stopPropagation()
            event.preventDefault()
          }
        }}
        // Only horizontal gestures belong to the chart: the page still scrolls vertically over it.
        style={{ touchAction: 'pan-y' }}
        className="relative select-none overflow-hidden pt-3"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-3 flex items-start border-t border-dashed border-line"
          style={{ height: 0 }}
        >
          {max > 0 && (
            <span className="-mt-2.5 bg-card pr-1 text-[11px] font-bold text-text-muted">
              ${formatCompact(max)}
            </span>
          )}
        </div>
        <ul
          className="grid grid-cols-6 items-end"
          style={{
            transform: `translateX(${offset}px)`,
            transition: offset === 0 ? 'transform 150ms' : 'none',
          }}
        >
          {points.map((point) => {
            const saved = Math.max(0, point.savedCents ?? 0)
            const isCurrent = point.month === currentMonth
            const isSelected = point.month === selected
            const future = point.kind === 'future'
            const january = point.month.slice(5, 7) === '01' || point.month === first
            const savedLabel = future ? 'sin registros todavía' : formatArs(saved)
            return (
              <li key={point.month} className="min-w-0">
                <button
                  type="button"
                  data-month={point.month}
                  aria-pressed={isSelected}
                  aria-label={`${monthTitle(point.month)}${isCurrent ? ' (mes actual)' : ''}: ahorrado ${savedLabel}, necesario ${formatArs(point.requiredCents)}${future ? ' (proyección)' : ''}`}
                  onClick={() => onSelect(point.month)}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 rounded-[14px] px-0.5 pb-1.5 pt-1 outline-offset-2',
                    isCurrent && 'bg-lime/30',
                    isSelected && 'ring-2 ring-ink',
                  )}
                >
                  <span
                    className="flex w-full items-end justify-center gap-[3px]"
                    style={{ height: PLOT_HEIGHT }}
                  >
                    <span
                      className={cn(
                        'w-[42%] max-w-[18px] rounded-t-[7px]',
                        'bg-forest dark:bg-lime',
                        future && 'hidden',
                      )}
                      style={{ height: barHeight(saved, max) }}
                    />
                    <span
                      className={cn(
                        'w-[42%] max-w-[18px] rounded-t-[7px] border-2 border-dashed border-b-0',
                        'border-forest/70 dark:border-lime/80',
                        future && 'bg-lime/30',
                      )}
                      style={{ height: barHeight(point.requiredCents, max) }}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-[13px] capitalize leading-4',
                      isCurrent ? 'font-extrabold' : 'font-bold text-text-muted',
                    )}
                  >
                    {monthShort(point.month)}
                  </span>
                  <span className="h-3 text-[10px] font-bold leading-3 text-text-muted">
                    {january ? point.month.slice(0, 4) : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-text-muted">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Referencias">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-3 rounded-[4px] bg-forest dark:bg-lime" />
            Ahorrado
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-[4px] border-2 border-dashed border-forest/70 dark:border-lime/80"
            />
            Necesario
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-[4px] border-2 border-dashed border-forest/70 bg-lime/30 dark:border-lime/80"
            />
            Proyección
          </li>
        </ul>
        {showToday && (
          <button
            type="button"
            onClick={onToday}
            className="min-h-8 rounded-full px-2 text-[13px] font-extrabold text-ink underline"
          >
            Volver a hoy
          </button>
        )}
      </div>
    </div>
  )
}
