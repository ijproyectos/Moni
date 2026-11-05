import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/ui/cn'

const ACTION_WIDTH = 76
const SWIPE_START_PX = 10
const OPEN_AT_PX = 40

interface SwipeRowProps {
  children: ReactNode
  /** Actions revealed by swiping left, in order (the last one is the outermost). */
  actions: readonly { label: string; onPress: () => void; tone: 'primary' | 'danger' }[]
  /** Pressing the row itself (outside of a swipe) does this. */
  onPress?: () => void
  pressLabel?: string
  className?: string
}

/**
 * A list row that opens its actions when swiped to the left. The actions are real buttons that exist at all times, so
 * the keyboard and screen readers reach them too (focusing one opens the row).
 */
export function SwipeRow({ children, actions, onPress, pressLabel, className }: SwipeRowProps) {
  const width = actions.length * ACTION_WIDTH
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; from: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const open = offset <= -width / 2

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, from: offset, moved: false }
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current
    if (!state) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (!state.moved) {
      if (Math.abs(dx) < SWIPE_START_PX || Math.abs(dx) < Math.abs(dy)) return
      state.moved = true
      setDragging(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    setOffset(Math.max(-width, Math.min(0, state.from + dx)))
  }

  function endDrag(event: React.PointerEvent) {
    const state = drag.current
    drag.current = null
    if (!state?.moved) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setDragging(false)
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 0)
    setOffset(offset < -OPEN_AT_PX ? -width : 0)
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width }}
        onFocusCapture={() => setOffset(-width)}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              setOffset(0)
              action.onPress()
            }}
            className={cn(
              'flex flex-1 items-center justify-center text-[15px] font-extrabold',
              action.tone === 'danger' ? 'bg-expense text-white' : 'bg-forest text-cream',
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(event) => {
          if (justDragged.current) {
            event.stopPropagation()
            event.preventDefault()
          } else if (open) {
            // A tap on an open row closes it instead of pressing it.
            event.stopPropagation()
            event.preventDefault()
            setOffset(0)
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 160ms',
          touchAction: 'pan-y',
        }}
        className="relative bg-canvas"
      >
        {onPress ? (
          <button
            type="button"
            onClick={onPress}
            aria-label={pressLabel}
            className="block w-full text-left"
          >
            {children}
          </button>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
