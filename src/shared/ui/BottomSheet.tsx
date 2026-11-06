import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useModal } from './useModal'

interface BottomSheetProps {
  title: string
  /** Small line under the title (e.g. the goal name). */
  subtitle?: string
  /** Small picture before the title (e.g. Moni's cat). */
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
}

/** How far (px) the grabber has to be dragged down to close the sheet. */
const SWIPE_CLOSE = 90

/** The keyboard hides more than this much of the layout viewport (px) when a field is focused. */
const KEYBOARD_MIN_PX = 120

/**
 * While the on-screen keyboard is open, the box of the visible area (iOS keeps the layout viewport under the
 * keyboard, so a bottom sheet would be covered). `undefined` when there is no keyboard or no visualViewport.
 */
function useKeyboardBox(): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties | undefined>(undefined)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () =>
      setBox(
        window.innerHeight - viewport.height > KEYBOARD_MIN_PX
          ? { top: viewport.offsetTop, height: viewport.height, bottom: 'auto' }
          : undefined,
      )
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])
  return box
}

/**
 * Modal sheet anchored to the bottom: focus trap, Escape/scrim/X to close, labelled by its title. Dragging the grabber
 * (or the title) down closes it too.
 */
export function BottomSheet({ title, subtitle, icon, onClose, children }: BottomSheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)
  const [drag, setDrag] = useState(0)
  useModal(panelRef, onClose)
  const keyboardBox = useKeyboardBox()

  function onDragStart(event: PointerEvent) {
    dragStart.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  function onDragMove(event: PointerEvent) {
    if (dragStart.current !== null) setDrag(Math.max(0, event.clientY - dragStart.current))
  }
  function onDragEnd() {
    if (dragStart.current === null) return
    dragStart.current = null
    if (drag >= SWIPE_CLOSE) onClose()
    else setDrag(0)
  }

  return createPortal(
    <div style={keyboardBox} className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-scrim motion-safe:animate-[fade-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={drag > 0 ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        className="relative max-h-[min(92dvh,100%)] w-full max-w-[430px] overflow-y-auto rounded-t-[32px] bg-canvas px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 outline-none motion-safe:animate-[sheet-in_220ms_ease-out]"
      >
        <div
          data-sheet-grabber
          aria-hidden="true"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="-mt-3 flex touch-none justify-center pb-3 pt-3"
        >
          <div className="h-1.5 w-12 rounded-full bg-sand" />
        </div>
        <div className="mb-4 short:mb-2 flex items-center justify-between gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-[22px] font-extrabold leading-7 text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[14px] leading-5 text-text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand text-ink"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
