import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import moniCat from '@/assets/mascot/moni-gato-fortuna-animado.svg'
import { cn } from '@/shared/ui/cn'
import { CAT_VISIBLE, clampToArea, nextPhrase } from '../domain/moniPhrases'
import { AssistantSheet } from './AssistantSheet'

const SIZE = 132
/** Space kept free (measured to what is drawn, not to the picture's box): the sides and the greeting row above the ears. */
const EDGE = 12
const TOP = 60
/** How far the floating animation lifts the cat (px): reserved at the top so the ears never leave the screen. */
const FLOAT_LIFT = 7
/** Gap between the paws and the top of the navigation bar. */
const BAR_GAP = 6
/** Without the bar (it hides while the keyboard is open) the paws keep this distance from the bottom of the screen. */
const NO_BAR_BOTTOM = 12
/** A touch that moves less than this is a tap; more is a drag. */
const DRAG_PX = 8
/** Moni talks often: a phrase soon after arriving, each one on screen a few seconds, the next one right after a short pause. */
const FIRST_BUBBLE_MS = 1200
const BUBBLE_VISIBLE_MS = 2200
const BUBBLE_GAP_MS = 2800
const POSITION_KEY = 'moni.agent.position'

type Point = { x: number; y: number }

/** Where the person left the cat during this visit (fractions of the area, so a different screen size still fits). */
function readSaved(): { fx: number; fy: number } | null {
  try {
    const raw = sessionStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fx?: unknown; fy?: unknown }
    return typeof parsed.fx === 'number' && typeof parsed.fy === 'number' ? { fx: parsed.fx, fy: parsed.fy } : null
  } catch {
    return null
  }
}

/**
 * Moni Agent: the full-body cat that floats over Inicio, apart from the content. It can be dragged anywhere in the screen
 * (it never leaves it nor covers the bottom bar), tapping it opens the chat, and from time to time it says something in a
 * small speech bubble. It lives only in Inicio.
 */
export function MoniAgent({ name = null }: { name?: string | null }) {
  const area = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState<string | null>(null)
  const [bubbleOn, setBubbleOn] = useState(false)
  const lastPhrase = useRef<string | null>(null)
  /** A tap (down and up without moving) waits for its own `click` to open the chat: opening on `pointerup` lets the browser's follow-up click land on the sheet that just appeared. */
  const tapped = useRef(false)
  const gesture = useRef<{ id: number; startX: number; startY: number; origin: Point; moved: boolean } | null>(null)

  /** The area and the margins for the cat; the bottom one follows the real position of the navigation bar. */
  const bounds = useCallback(() => {
    const rect = area.current?.getBoundingClientRect()
    const width = rect?.width ?? 0
    const height = rect?.height ?? 0
    const bar = document.querySelector('nav[aria-label="Navegación principal"]')?.getBoundingClientRect()
    const bottom = bar && bar.height > 0 ? Math.max(0, height - (bar.top - (rect?.top ?? 0)) + BAR_GAP) : NO_BAR_BOTTOM
    return { width, height, margin: { edge: EDGE, top: TOP, bottom } }
  }, [])

  // First position: where it was left, or the right side just above the bottom bar. Fitted again when the screen changes.
  useLayoutEffect(() => {
    const place = () => {
      const size = bounds()
      const saved = readSaved()
      setPos((current) => {
        const wanted = current ?? (saved
          ? { x: saved.fx * size.width, y: saved.fy * size.height }
          : { x: size.width, y: size.height })
        return clampToArea(wanted, size, SIZE, size.margin, FLOAT_LIFT)
      })
    }
    place()
    // The bar can settle a moment after the first paint (fonts, safe areas): fit once more.
    const frame = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
    }
  }, [bounds])

  // The speech bubble: it fades in with a phrase, fades out, and after a short pause the next phrase (always a different one)
  // comes in. The phrase only changes while the bubble is invisible, so the change is a soft cross-fade. While the chat is
  // open the rotation is paused.
  useEffect(() => {
    if (open) return
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      const next = nextPhrase(lastPhrase.current)
      lastPhrase.current = next
      setPhrase(next)
      setBubbleOn(true)
      timer = setTimeout(hide, BUBBLE_VISIBLE_MS)
    }
    const hide = () => {
      setBubbleOn(false)
      timer = setTimeout(show, BUBBLE_GAP_MS)
    }
    timer = setTimeout(show, FIRST_BUBBLE_MS)
    return () => {
      clearTimeout(timer)
      setBubbleOn(false)
    }
  }, [open])

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!pos) return
    gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: pos, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    const dx = event.clientX - g.startX
    const dy = event.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) < DRAG_PX) return
    if (!g.moved) {
      g.moved = true
      setDragging(true)
      setBubbleOn(false)
    }
    setPos(clampToArea({ x: g.origin.x + dx, y: g.origin.y + dy }, bounds(), SIZE, bounds().margin, FLOAT_LIFT))
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    gesture.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (g.moved) {
      setDragging(false)
      const size = bounds()
      if (pos && size.width > 0 && size.height > 0) {
        try {
          sessionStorage.setItem(POSITION_KEY, JSON.stringify({ fx: pos.x / size.width, fy: pos.y / size.height }))
        } catch {
          /* the position just is not remembered */
        }
      }
    } else if (event.type === 'pointerup') {
      tapped.current = true
    }
  }

  function onClick() {
    if (!tapped.current) return
    tapped.current = false
    setOpen(true)
  }

  // Keyboard: Enter / Space open the chat (a mouse or touch tap goes through the pointer events and the click above).
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const size = bounds()
  const onRight = pos ? pos.x + SIZE / 2 > size.width / 2 : true
  const above = pos ? pos.y > 80 : true

  return (
    <>
      <div ref={area} className="pointer-events-none fixed inset-0 z-20 mx-auto max-w-[430px]">
        {pos && (
          <div className="absolute" style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}>
            {phrase && (
              <p
                role="status"
                aria-live="polite"
                data-testid="moni-bubble"
                // Aligned to the drawn cat (not to its box, which has empty space), so it never reaches the screen edge.
                style={onRight ? { right: (1 - CAT_VISIBLE.right) * SIZE } : { left: CAT_VISIBLE.left * SIZE }}
                className={cn(
                  'pointer-events-none absolute w-max min-w-[84px] max-w-[176px] rounded-2xl text-center border border-line bg-card px-3 py-1.5 text-[13px] font-bold leading-tight text-ink shadow-[0_6px_18px_rgba(17,34,24,0.16)] transition-opacity duration-500 ease-in-out motion-reduce:transition-none',
                  // Clear of the cat: a small gap above the ears (or below the paws) that the tail crosses.
                  above ? 'bottom-full mb-3.5' : 'top-full mt-px',
                  bubbleOn && !dragging && !open ? 'opacity-100' : 'opacity-0',
                )}
              >
                {phrase}
                <span
                  aria-hidden="true"
                  style={onRight ? { right: 41 } : { left: 41 }}
                  className={cn(
                    'absolute size-2.5 rotate-45 bg-card',
                    above ? '-bottom-[3.5px] border-b border-r border-line' : '-top-[3.5px] border-l border-t border-line',
                  )}
                />
              </p>
            )}
            <button
              type="button"
              aria-label="Hablá con Moni"
              aria-haspopup="dialog"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onKeyDown={onKeyDown}
              onClick={onClick}
              className={cn(
                'pointer-events-auto size-full touch-none select-none rounded-full outline-none [clip-path:inset(-60px_-60px_6px_-60px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink',
                dragging ? 'cursor-grabbing' : 'cursor-grab',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none relative block size-full',
                  !dragging && 'motion-safe:animate-[moni-float_3.6s_ease-in-out_infinite]',
                )}
              >
                {/* The drawing already waves its paw on a loop; the eyes are static, so the lids are drawn over them. */}
                <img
                  src={moniCat}
                  alt=""
                  draggable={false}
                  className="pointer-events-none size-full object-contain drop-shadow-[0_8px_10px_rgba(17,34,24,0.22)]"
                />
                <svg
                  viewBox="0 0 1024 1024"
                  data-testid="moni-blink"
                  className="pointer-events-none absolute inset-0 size-full opacity-0 motion-safe:animate-[moni-blink_5.4s_linear_infinite]"
                >
                  <g fill="#fcf1dc">
                    <rect x="358" y="229" width="128" height="94" rx="14" />
                    <rect x="538" y="229" width="128" height="94" rx="14" />
                  </g>
                  <g fill="none" stroke="#1d4a3a" strokeWidth="11" strokeLinecap="round">
                    <path d="M372 290 Q422 312 472 290" />
                    <path d="M552 290 Q602 312 652 290" />
                  </g>
                </svg>
              </span>
            </button>
          </div>
        )}
      </div>
      {open && <AssistantSheet name={name} onClose={() => setOpen(false)} />}
    </>
  )
}
