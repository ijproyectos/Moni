import { ChevronLeft, ChevronRight, Lightbulb, Pause, Play, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import mascotGoals from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import mascotNotice from '@/assets/mascot/personaje_notificaciones.svg'
import mascotReport from '@/assets/mascot/personaje_informe-del-mes.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { RecurringReminders } from '@/features/recurring/ui/RecurringReminders'
import { SavingsNotices } from '@/features/goals/ui/SavingsNotices'
import { cn } from '@/shared/ui/cn'
import { useModal } from '@/shared/ui/useModal'
import type { Story, StorySlide } from '../domain/stories'
import { STORY_VIEW } from './storyTones'

/** Reading time of a slide: a base plus a little more for every supporting line. */
const BASE_MS = 7000
const LINE_MS = 1500
const HOLD_MS = 250
/** A downward drag longer than this (and more vertical than sideways) closes the viewer. */
const SWIPE_CLOSE_PX = 80
/** Moves under this many pixels still count as a tap. */
const TAP_SLOP_PX = 10

function mascotFor(story: Story): string {
  if (story.id === 'metas') return mascotGoals
  if (story.id === 'gastos') return mascotReport
  if (story.id === 'limites') return mascotAlert
  if (story.id === 'logros') return mascotHappy
  if (story.id === 'cobros' || story.id === 'deudas' || story.id.startsWith('grupo-'))
    return mascotGroup
  return mascotNotice
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

interface StoryViewerProps {
  stories: readonly Story[]
  startIndex: number
  onClose: () => void
  /** A story was shown (it counts as seen). */
  onViewed: (story: Story) => void
}

/**
 * Full screen reader of the stories, in Moni's style: progress bars on top, tap the left or right side to move, hold to
 * pause, it advances by itself with time enough to read, and it never moves on its own while the person is answering
 * something (a slide that hosts actions) or when they asked for reduced motion.
 */
export function StoryViewer({ stories: initial, startIndex, onClose, onViewed }: StoryViewerProps) {
  // The list the person opened: if what they answer inside changes the data, the story does not jump away.
  const [stories] = useState(initial)
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(stories.length - 1, 0)))
  const [slideIndex, setSlideIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const reduced = usePrefersReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const pressedAt = useRef(0)
  const pressedFrom = useRef({ x: 0, y: 0 })
  const closeOnce = useCallback(() => {
    // A sheet opened from a slide is a dialog of its own: Escape belongs to it first.
    if (document.querySelectorAll('[role="dialog"]').length > 1) return
    onClose()
  }, [onClose])
  useModal(panelRef, closeOnce)

  const story = stories[index]
  const slide: StorySlide | undefined = story?.slides[slideIndex]
  const interactive = Boolean(slide?.embed)
  const duration = BASE_MS + (slide?.lines?.length ?? 0) * LINE_MS
  const running = !paused && !holding && !interactive && !reduced && Boolean(slide)

  useEffect(() => {
    if (story) onViewed(story)
    // Marking is idempotent; only the story that is on screen matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id])

  const next = useCallback(() => {
    if (!story) return
    setElapsed(0)
    if (slideIndex < story.slides.length - 1) setSlideIndex(slideIndex + 1)
    else if (index < stories.length - 1) {
      setIndex(index + 1)
      setSlideIndex(0)
    } else onClose()
  }, [story, slideIndex, index, stories.length, onClose])

  const previous = useCallback(() => {
    setElapsed(0)
    if (slideIndex > 0) setSlideIndex(slideIndex - 1)
    else if (index > 0) {
      setIndex(index - 1)
      setSlideIndex(0)
    }
  }, [slideIndex, index])

  // The clock of the current slide.
  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setElapsed((e) => e + dt)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running])

  useEffect(() => {
    if (running && elapsed >= duration) next()
  }, [running, elapsed, duration, next])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (document.querySelectorAll('[role="dialog"]').length > 1) return
      if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') previous()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, previous])

  if (!story || !slide) return null
  const view = STORY_VIEW[story.tone]
  const isFirst = index === 0 && slideIndex === 0

  /** Pointer handling of a tap area: a quick tap navigates, a hold pauses, a long drag down closes. */
  const holdProps = (action: () => void) => ({
    onPointerDown: (event: React.PointerEvent) => {
      pressedAt.current = performance.now()
      pressedFrom.current = { x: event.clientX, y: event.clientY }
      setHolding(true)
    },
    onPointerUp: (event: React.PointerEvent) => {
      setHolding(false)
      const dx = event.clientX - pressedFrom.current.x
      const dy = event.clientY - pressedFrom.current.y
      if (dy > SWIPE_CLOSE_PX && dy > Math.abs(dx)) return closeOnce()
      const moved = Math.hypot(dx, dy) > TAP_SLOP_PX
      if (!moved && performance.now() - pressedAt.current < HOLD_MS) action()
    },
    onPointerLeave: () => setHolding(false),
    onPointerCancel: () => setHolding(false),
  })

  const roundButton =
    'flex size-[54px] items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current'
  const cardStyle = { backgroundColor: view.card, color: view.cardInk }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Historia: ${story.label}`}
      tabIndex={-1}
      data-autofocus
      className="fixed inset-0 z-40 mx-auto flex w-full max-w-[430px] flex-col overflow-hidden outline-none"
      style={{ backgroundColor: view.bg, color: view.ink }}
    >
      {/* Tap areas: the left third goes back, the rest goes on. The content sits above them and only its controls catch taps.
          The buttons of the bottom row are the accessible way to move. */}
      <div
        aria-hidden="true"
        data-testid="story-tap-prev"
        className="absolute inset-y-0 left-0 z-0 w-1/3"
        {...holdProps(previous)}
      />
      <div
        aria-hidden="true"
        data-testid="story-tap-next"
        className="absolute inset-y-0 right-0 z-0 w-2/3"
        {...holdProps(next)}
      />

      <div className="pointer-events-none relative z-10 px-[18px] pt-[max(env(safe-area-inset-top),14px)]">
        <div
          role="progressbar"
          aria-label="Avance de la historia"
          aria-valuemin={1}
          aria-valuemax={stories.length}
          aria-valuenow={index + 1}
          aria-valuetext={`Historia ${index + 1} de ${stories.length}`}
          className="flex gap-1"
        >
          {stories.map((s, i) => {
            const fraction = reduced || interactive ? 1 : Math.min(1, elapsed / duration)
            const current = ((slideIndex + fraction) / story.slides.length) * 100
            return (
              <span
                key={s.id}
                className="h-1 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: `color-mix(in srgb, ${view.ink} 25%, transparent)` }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    backgroundColor: view.ink,
                    width: i < index ? '100%' : i > index ? '0%' : `${current}%`,
                  }}
                />
              </span>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <img
            src={mascotFor(story)}
            alt=""
            className="size-9 shrink-0 rounded-full object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[14.5px] font-bold leading-tight">Moni</p>
            <p className="truncate text-[12px] opacity-80">Tu resumen de hoy</p>
          </div>
          {!reduced && !interactive && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Reanudar' : 'Pausar'}
              aria-pressed={paused}
              className="pointer-events-auto flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              style={cardStyle}
            >
              {paused ? (
                <Play aria-hidden="true" className="size-5" fill="currentColor" />
              ) : (
                <Pause aria-hidden="true" className="size-5" fill="currentColor" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar historia"
            className="pointer-events-auto flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={cardStyle}
          >
            <X aria-hidden="true" className="size-5" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] pb-4 pt-6">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] opacity-85">
            {story.label}
          </p>
          <h2 className="text-balance font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">
            {slide.title}
          </h2>
          {slide.figure && (
            <p className="break-words font-display text-[clamp(38px,13vw,46px)] font-bold leading-none tracking-[-0.04em] tabular-nums">
              {slide.figure}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[26px] p-4" style={cardStyle}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] opacity-75">
            Qué pasó
          </p>
          <p className="text-[16px] leading-[1.35]">{slide.body}</p>
          {slide.lines && (
            <ul className="mt-1 flex flex-col gap-1 text-[14.5px] opacity-85">
              {slide.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        {slide.tip && (
          <div className="flex flex-col gap-1.5 rounded-[26px] bg-white p-4 text-[#112218]">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#17734B]">
              <Lightbulb aria-hidden="true" className="size-[15px]" strokeWidth={2.2} />
              Qué podés mejorar
            </p>
            <p className="text-[16px] font-medium leading-[1.35]">{slide.tip}</p>
          </div>
        )}
        {slide.embed && (
          <div className="pointer-events-auto rounded-[24px] bg-canvas p-3 text-ink">
            {slide.embed === 'savings-notices' ? <SavingsNotices /> : <RecurringReminders />}
          </div>
        )}
      </div>

      <div className="pointer-events-none relative z-10 grid grid-cols-[54px_1fr_54px] items-center gap-2.5 px-[18px] pb-[max(env(safe-area-inset-bottom),22px)]">
        <button
          type="button"
          onClick={previous}
          disabled={isFirst}
          aria-label="Anterior"
          className={cn(roundButton, 'pointer-events-auto')}
          style={cardStyle}
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
        {slide.action ? (
          <Link
            to={slide.action.to}
            onClick={onClose}
            className="pointer-events-auto flex h-[54px] items-center justify-center rounded-full px-5 text-center text-[16px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ backgroundColor: view.button, color: view.buttonInk }}
          >
            {slide.action.label}
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={next}
          aria-label="Siguiente"
          className={cn(roundButton, 'pointer-events-auto')}
          style={cardStyle}
        >
          <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
