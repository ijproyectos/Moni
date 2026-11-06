import { useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'

const ACTION_WIDTH = 76
const SWIPE_START_PX = 10
const OPEN_AT_PX = 40

interface SwipeAction {
  label: string
  onPress: () => void
  tone: 'primary' | 'danger'
  /** Accessible name when the visible label alone would be ambiguous (many rows share "Editar"). */
  ariaLabel?: string
}

interface SwipeRowProps {
  children: ReactNode
  /** Actions revealed by swiping left, in order (the last one is the outermost). */
  actions: readonly SwipeAction[]
  /** Action revealed by swiping right (e.g. void). Without it the row only swipes left. */
  leadingAction?: SwipeAction
  /** Pressing the row itself (outside of a swipe) does this. */
  onPress?: () => void
  pressLabel?: string
  className?: string
}

function ActionButton({ action, onDone }: { action: SwipeAction; onDone: () => void }) {
  return (
    <button
      type="button"
      aria-label={action.ariaLabel}
      onClick={() => {
        onDone()
        action.onPress()
      }}
      className={cn(
        'flex flex-1 items-center justify-center text-[15px] font-extrabold',
        action.tone === 'danger' ? 'bg-expense text-white' : 'bg-forest text-cream',
      )}
    >
      {action.label}
    </button>
  )
}

/**
 * A list row that opens its actions when swiped: to the left it reveals `actions`, to the right the `leadingAction`.
 * The actions are real buttons that exist at all times, so the keyboard and screen readers reach them too (focusing
 * one opens the row). With reduced motion the row still opens, just without the slide.
 */
export function SwipeRow({
  children,
  actions,
  leadingAction,
  onPress,
  pressLabel,
  className,
}: SwipeRowProps) {
  const trailingWidth = actions.length * ACTION_WIDTH
  const leadingWidth = leadingAction ? ACTION_WIDTH : 0
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; from: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const open = offset !== 0 && (offset <= -trailingWidth / 2 || offset >= leadingWidth / 2)

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
    setOffset(Math.max(-trailingWidth, Math.min(leadingWidth, state.from + dx)))
  }

  function endDrag(event: React.PointerEvent) {
    const state = drag.current
    drag.current = null
    if (!state?.moved) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setDragging(false)
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 0)
    if (trailingWidth > 0 && offset < -OPEN_AT_PX) setOffset(-trailingWidth)
    else if (leadingWidth > 0 && offset > OPEN_AT_PX) setOffset(leadingWidth)
    else setOffset(0)
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {leadingAction && (
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{ width: leadingWidth }}
          onFocusCapture={() => setOffset(leadingWidth)}
        >
          <ActionButton action={leadingAction} onDone={() => setOffset(0)} />
        </div>
      )}
      {actions.length > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex"
          style={{ width: trailingWidth }}
          onFocusCapture={() => setOffset(-trailingWidth)}
        >
          {actions.map((action) => (
            <ActionButton key={action.label} action={action} onDone={() => setOffset(0)} />
          ))}
        </div>
      )}
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
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        className={cn(
          'relative bg-canvas transition-transform duration-150 motion-reduce:transition-none',
          dragging && 'transition-none',
        )}
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
