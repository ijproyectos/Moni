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
import { cn } from './cn'
import { FOCUS_RING } from './focusRing'
import { useModal } from './useModal'

interface BottomSheetProps {
  title: string
  /** Small line under the title (e.g. the goal name). */
  subtitle?: string
  /** Small picture before the title (e.g. Moni's cat). */
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  /**
   * `sheet` is the classic sheet; `menta` the assistant sheet of the Menta design (36px corners, smaller grabber,
   * white close circle); `screen` a full-height screen that still behaves as a modal (X on the left, title centered).
   */
  variant?: 'sheet' | 'menta' | 'screen'
  /** `screen` only: no header at all. The title stays in the dialog name for screen readers. */
  bare?: boolean
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
export function BottomSheet({
  title,
  subtitle,
  icon,
  onClose,
  children,
  variant = 'sheet',
  bare = false,
}: BottomSheetProps) {
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
        className={cn(
          'relative w-full max-w-[430px] overflow-y-auto bg-canvas outline-none motion-safe:animate-[sheet-in_220ms_ease-out]',
          variant === 'sheet' &&
            'max-h-[min(92dvh,100%)] rounded-t-[32px] px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-3',
          variant === 'menta' &&
            'max-h-[min(92dvh,100%)] rounded-t-[36px] px-[18px] pb-[max(env(safe-area-inset-bottom),22px)] pt-3',
          variant === 'screen' &&
            'flex h-full flex-col px-[18px] pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),4px)]',
        )}
      >
        {variant !== 'screen' && (
          <div
            data-sheet-grabber
            aria-hidden="true"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            className={cn(
              'flex touch-none justify-center pt-3',
              variant === 'menta' ? '-mt-3 pb-3.5' : '-mt-3 pb-3',
            )}
          >
            <div
              className={cn(
                'rounded-full',
                variant === 'menta' ? 'h-[5px] w-10 bg-[#C7D6CB]' : 'h-1.5 w-12 bg-sand',
              )}
            />
          </div>
        )}
        {variant === 'screen' ? (
          bare ? (
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
          ) : (
            <div className="mb-3 grid shrink-0 grid-cols-[44px_1fr_44px] items-center">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className={cn(
                  'flex size-11 items-center justify-center rounded-full bg-card text-ink',
                  FOCUS_RING,
                )}
              >
                <X aria-hidden="true" className="size-5" strokeWidth={2.2} />
              </button>
              <div className="min-w-0 text-center">
                <h2
                  id={titleId}
                  className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-ink"
                >
                  {title}
                </h2>
                {subtitle && <p className="text-[12.5px] text-text-muted">{subtitle}</p>}
              </div>
              <span aria-hidden="true" />
            </div>
          )
        ) : variant === 'menta' ? (
          <div className="mb-3.5 flex items-center gap-3">
            {icon}
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-ink"
              >
                {title}
              </h2>
              {subtitle && <p className="text-[13px] text-text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-ink',
                FOCUS_RING,
              )}
            >
              <X aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </button>
          </div>
        ) : (
          <div className="mb-4 short:mb-2 flex items-center justify-between gap-3">
            {icon}
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="font-display text-[22px] font-extrabold leading-7 text-ink"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 text-[14px] leading-5 text-text-muted">{subtitle}</p>
              )}
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
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
