import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import moniCat from '@/assets/mascot/moni-gato-fortuna-animado.svg'
import { cn } from '@/shared/ui/cn'
import { CAT_VISIBLE, clampToArea, nextInterval, nextPhrase } from '../domain/moniPhrases'
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
/** Moni talks now and then: the first phrase 8 s after arriving, each one on screen 3 s, the next 12–15 s after it appeared. */
const FIRST_BUBBLE_MS = 8000
const BUBBLE_VISIBLE_MS = 3000
/** Inertia: the drawn cat closes the gap to the finger with this time constant (ms): fluid, never far behind. */
const FOLLOW_MS = 70
/** Coin trail while dragging: one coin every so many px of travel (and not faster than the minimum gap), few at once. */
const COIN_EVERY_PX = 56
const COIN_MIN_GAP_MS = 130
const COIN_MAX = 7
const POSITION_KEY = 'moni.agent.position'

type Point = { x: number; y: number }
type Coin = { id: number; x: number; y: number; size: number; dx: number; dy: number; rot: number; ms: number }

const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
  const catEl = useRef<HTMLDivElement>(null)
  /** Where the cat is drawn right now (follows `pos` with inertia); `pos` itself is the real, clamped position. */
  const shown = useRef<Point | null>(null)
  const target = useRef<Point | null>(null)
  const frame = useRef(0)
  const [coins, setCoins] = useState<Coin[]>([])
  const coinTrail = useRef({ x: 0, y: 0, at: 0, id: 0 })
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

  // Inertia: the box sits at `pos` (layout); a translate carries the drawn cat from where it was to there, easing out.
  useLayoutEffect(() => {
    const el = catEl.current
    if (!pos || !el) return
    target.current = pos
    if (!shown.current || reducedMotion()) shown.current = { ...pos }
    const paint = () => {
      const s = shown.current as Point
      el.style.transform = `translate3d(${s.x - pos.x}px, ${s.y - pos.y}px, 0)`
    }
    paint()
    cancelAnimationFrame(frame.current)
    let last = performance.now()
    const step = (now: number) => {
      const s = shown.current as Point
      const k = 1 - Math.exp(-Math.min(now - last, 64) / FOLLOW_MS)
      last = now
      s.x += (pos.x - s.x) * k
      s.y += (pos.y - s.y) * k
      if (Math.hypot(pos.x - s.x, pos.y - s.y) < 0.3) {
        shown.current = { ...pos }
        paint()
        return
      }
      paint()
      frame.current = requestAnimationFrame(step)
    }
    if (Math.hypot(pos.x - shown.current.x, pos.y - shown.current.y) >= 0.3) frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [pos])

  // The speech bubble: it fades in with a phrase, stays 3 s and fades out; the next one comes 12–15 s after the previous one
  // appeared (always a different phrase). Nothing is shown while the cat is dragged, while the chat is open or while the tab
  // is in the background: then the phrase is skipped and the clock starts over.
  const draggingRef = useRef(false)
  draggingRef.current = dragging
  useEffect(() => {
    if (open) return
    let timer: ReturnType<typeof setTimeout>
    let hideTimer: ReturnType<typeof setTimeout>
    const hidden = () => document.visibilityState === 'hidden'
    const schedule = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(show, ms)
    }
    const show = () => {
      if (draggingRef.current || hidden()) {
        schedule(nextInterval())
        return
      }
      const next = nextPhrase(lastPhrase.current)
      lastPhrase.current = next
      setPhrase(next)
      setBubbleOn(true)
      hideTimer = setTimeout(() => setBubbleOn(false), BUBBLE_VISIBLE_MS)
      schedule(nextInterval())
    }
    const onVisibility = () => {
      if (hidden()) {
        clearTimeout(timer)
        clearTimeout(hideTimer)
        setBubbleOn(false)
      } else {
        schedule(nextInterval())
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    schedule(FIRST_BUBBLE_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(timer)
      clearTimeout(hideTimer)
      setBubbleOn(false)
    }
  }, [open])

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!pos) return
    gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, origin: pos, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  /** A coin near the cat's body, only after some travel: few, spaced, and never with reduced motion. */
  function spawnCoin(now: number) {
    const at = shown.current
    if (!at || reducedMotion()) return
    const t = coinTrail.current
    if (t.at === 0) Object.assign(t, { x: at.x, y: at.y, at: now })
    if (Math.hypot(at.x - t.x, at.y - t.y) < COIN_EVERY_PX || now - t.at < COIN_MIN_GAP_MS) return
    t.x = at.x
    t.y = at.y
    t.at = now
    const r = (min: number, max: number) => min + Math.random() * (max - min)
    const coin: Coin = {
      id: ++t.id,
      x: at.x + SIZE * r(0.3, 0.7),
      y: at.y + SIZE * r(0.45, 0.85),
      size: Math.round(r(11, 17)),
      dx: Math.round(r(-26, 26)),
      dy: Math.round(r(-30, 14)),
      rot: Math.round(r(-80, 80)),
      ms: Math.round(r(620, 880)),
    }
    setCoins((list) => [...list.slice(-(COIN_MAX - 1)), coin])
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
    spawnCoin(event.timeStamp)
    setPos(clampToArea({ x: g.origin.x + dx, y: g.origin.y + dy }, bounds(), SIZE, bounds().margin, FLOAT_LIFT))
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    gesture.current = null
    coinTrail.current.at = 0
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
        {coins.map((c) => (
          <span
            key={c.id}
            aria-hidden="true"
            data-testid="moni-coin"
            onAnimationEnd={() => setCoins((list) => list.filter((x) => x.id !== c.id))}
            className="pointer-events-none absolute grid place-items-center rounded-full border border-[#B8862B] bg-[#F6CA5A] font-display font-extrabold leading-none text-[#6B4A0E] motion-safe:animate-[moni-coin_var(--ms)_ease-out_forwards]"
            style={{
              left: c.x - c.size / 2,
              top: c.y - c.size / 2,
              width: c.size,
              height: c.size,
              fontSize: c.size * 0.62,
              '--dx': `${c.dx}px`,
              '--dy': `${c.dy}px`,
              '--rot': `${c.rot}deg`,
              '--ms': `${c.ms}ms`,
            } as CSSProperties}
          >
            $
          </span>
        ))}
        {pos && (
          <div ref={catEl} className="absolute will-change-transform" style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}>
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
