import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_feliz.svg'
import { useAuth } from '@/features/auth/api/authContext'
import { GUIDE_STEPS, markGuideDone, shouldAutoShowGuide } from '../domain/guide'
import { useGuideStatus, type GuideStatus } from '../api/useGuideStatus'
import { consumeGuideRequest, setGuideActive, useGuideRequested } from './guideStore'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 6
const CARD_GAP = 14
const CARD_HEIGHT = 230
/** About three seconds for a screen to load its element before the step is skipped. */
const MAX_TRIES = 25

/**
 * The guided tour of Moni. It opens by itself once, the first time a person who just finished the onboarding enters the app, and
 * again whenever they ask for it (Configuración › Conocé Moni). It opens the real screens one by one and highlights real elements;
 * the screen behind is blocked, so nothing can be tapped, saved or changed during the tour. Completed or skipped is saved in the
 * person's profile.
 */
export function GuideHost() {
  const { user } = useAuth()
  const requested = useGuideRequested()
  const guide = useGuideStatus()
  const [dismissed, setDismissed] = useState(false)
  const auto = Boolean(user) && !dismissed && guide.loaded && guide.status === null && shouldAutoShowGuide(user?.id ?? '')
  const open = Boolean(user) && (requested || auto) && !dismissed

  function close(kind: GuideStatus) {
    if (user) markGuideDone(user.id)
    // A replay never overwrites the first answer.
    if (guide.status === null) void guide.save(kind).catch(() => undefined)
    consumeGuideRequest()
    setDismissed(true)
  }

  return open ? <Tour onClose={close} /> : null
}

function findTarget(targets: readonly string[]): Element | null {
  for (const selector of targets) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

function Tour({ onClose }: { onClose: (kind: GuideStatus) => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathRef = useRef(pathname)
  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  const direction = useRef<1 | -1>(1)
  const current = useRef(0)
  const next = useRef<HTMLButtonElement>(null)
  const step = GUIDE_STEPS[index]
  const last = GUIDE_STEPS.length - 1

  useEffect(() => {
    setGuideActive(true)
    return () => setGuideActive(false)
  }, [])

  // Opens the real screen of the step, finds the real element (waiting for the screen to load), scrolls it into view and follows it.
  useEffect(() => {
    if (!step) return
    if (pathRef.current !== step.path) navigate(step.path)
    let tries = 0
    let scrolled = false
    const timer = window.setInterval(() => {
      const el = pathRef.current === step.path ? findTarget(step.targets) : null
      if (!el) {
        tries += 1
        if (tries > MAX_TRIES) go(direction.current)
        return
      }
      if (!scrolled) {
        scrolled = true
        el.scrollIntoView?.({ block: 'center' })
      }
      const r = el.getBoundingClientRect()
      setBox((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      )
      setViewport((prev) => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }))
    }, 120)
    return () => window.clearInterval(timer)
    // `go` and `navigate` only read refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const ready = box !== null
  useEffect(() => {
    next.current?.focus()
  }, [index, ready])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('skipped')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function go(dir: 1 | -1) {
    direction.current = dir
    const target = current.current + dir
    if (target > last) return onClose('completed')
    // Going back past a first step that is not there: move on to the next one instead.
    const nextIndex = target < 0 ? 1 : target
    if (target < 0) direction.current = 1
    current.current = nextIndex
    setBox(null)
    setIndex(nextIndex)
  }

  if (!step) return null

  const spaceAbove = box ? box.top : 0
  const spaceBelow = box ? viewport.h - (box.top + box.height) : 0
  // The card goes where there is room, so it never covers what it explains.
  const below = box ? spaceBelow >= CARD_HEIGHT || spaceBelow >= spaceAbove : true
  const cardWidth = Math.min(340, viewport.w - 32)
  const cardStyle = box
    ? below
      ? { top: Math.min(box.top + box.height + PAD + CARD_GAP, viewport.h - CARD_HEIGHT), width: cardWidth }
      : { bottom: viewport.h - box.top + PAD + CARD_GAP, width: cardWidth }
    : { top: viewport.h / 3, width: cardWidth }
  const isLast = index === last

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* Blocks taps on the screen behind: the tour is moved only with its own buttons. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[22px] ring-2 ring-lime shadow-[0_0_0_9999px_rgba(8,20,14,0.62)] motion-safe:transition-all motion-safe:duration-200"
          style={{ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
        />
      )}
      <section
        role="dialog"
        aria-label={`Guía de Moni: ${step.title}`}
        className="absolute left-1/2 -translate-x-1/2 rounded-[24px] border border-line bg-card p-4 text-ink shadow-[0_18px_50px_rgba(8,20,14,0.35)]"
        style={cardStyle}
      >
        <div className="flex items-start gap-3">
          <img src={mascotUrl} alt="" className="size-12 shrink-0 object-contain" />
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{`${index + 1} de ${GUIDE_STEPS.length}`}</p>
            <h2 className="font-display text-[20px] font-extrabold leading-6">{step.title}</h2>
            <p className="mt-1 text-[15px] leading-[22px] text-text-muted">{step.text}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              className="h-11 flex-1 rounded-full border-2 border-line text-[15px] font-extrabold text-ink"
            >
              Atrás
            </button>
          )}
          <button
            ref={next}
            type="button"
            onClick={() => (isLast ? onClose('completed') : go(1))}
            className="h-11 flex-[2] rounded-full bg-forest text-[15px] font-extrabold text-cream dark:bg-lime dark:text-on-bright"
          >
            {isLast ? 'Finalizar' : 'Siguiente'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onClose('skipped')}
          className="mx-auto mt-1 flex min-h-11 items-center px-4 text-[14px] font-bold text-text-muted underline underline-offset-4"
        >
          Omitir guía
        </button>
      </section>
    </div>
  )
}
