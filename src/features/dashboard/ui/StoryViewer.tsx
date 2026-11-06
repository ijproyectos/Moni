import { Pause, Play, X } from 'lucide-react'
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
import { STORY_TONES } from './storyTones'

/** Reading time of a slide: a base plus a little more for every supporting line. */
const BASE_MS = 7000
const LINE_MS = 1500
const HOLD_MS = 250

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
  const tone = STORY_TONES[story.tone]

  const holdProps = (action: () => void) => ({
    onPointerDown: () => {
      pressedAt.current = performance.now()
      setHolding(true)
    },
    onPointerUp: () => {
      setHolding(false)
      if (performance.now() - pressedAt.current < HOLD_MS) action()
    },
    onPointerLeave: () => setHolding(false),
    onPointerCancel: () => setHolding(false),
    // The keyboard and assistive technologies click: pointer taps are handled above.
    onClick: (event: React.MouseEvent) => {
      if (event.detail === 0) action()
    },
  })

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Historia: ${story.label}`}
      tabIndex={-1}
      data-autofocus
      className="fixed inset-0 z-40 mx-auto flex w-full max-w-[430px] flex-col overflow-hidden bg-[#051f20] text-[#daf1de] outline-none"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-[360px] rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: tone.ring }}
      />

      <div className="relative z-10 px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <div
          role="progressbar"
          aria-label="Avance de la historia"
          aria-valuemin={1}
          aria-valuemax={story.slides.length}
          aria-valuenow={slideIndex + 1}
          className="flex gap-1.5"
        >
          {story.slides.map((_, i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <span
                className="block h-full rounded-full bg-[#daf1de]"
                style={{
                  width:
                    i < slideIndex
                      ? '100%'
                      : i > slideIndex
                        ? '0%'
                        : reduced || interactive
                          ? '100%'
                          : `${Math.min(100, (elapsed / duration) * 100)}%`,
                }}
              />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full border-2 font-display text-[13px] font-extrabold"
            style={{ borderColor: tone.ring, backgroundColor: tone.fill, color: tone.ink }}
          >
            {story.bubble.length > 3 ? '' : story.bubble}
          </span>
          <p className="flex-1 truncate font-display text-[17px] font-extrabold">{story.label}</p>
          {!reduced && !interactive && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Reanudar' : 'Pausar'}
              aria-pressed={paused}
              className="flex size-11 items-center justify-center rounded-full bg-white/10"
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
            className="flex size-11 items-center justify-center rounded-full bg-white/10"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Tap areas: the left third goes back, the rest goes on. The content sits above them and only its controls catch taps. */}
      <button
        type="button"
        aria-label="Anterior"
        className="absolute inset-y-0 left-0 z-0 w-1/3"
        {...holdProps(previous)}
      />
      <button
        type="button"
        aria-label="Siguiente"
        className="absolute inset-y-0 right-0 z-0 w-2/3"
        {...holdProps(next)}
      />

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-center gap-4 overflow-y-auto px-6 py-6">
        <h2 className="font-display text-[26px] font-extrabold leading-8">{slide.title}</h2>
        {slide.figure && (
          <p
            className="break-words font-display text-[clamp(40px,14vw,60px)] font-extrabold leading-none"
            style={{ color: tone.ring }}
          >
            {slide.figure}
          </p>
        )}
        <p className="text-[19px] leading-7">{slide.body}</p>
        {slide.lines && (
          <ul className="flex flex-col gap-2 text-[16px] text-[#b5cbb0]">
            {slide.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {slide.embed && (
          <div className="pointer-events-auto rounded-[24px] bg-canvas p-3 text-ink">
            {slide.embed === 'savings-notices' ? <SavingsNotices /> : <RecurringReminders />}
          </div>
        )}
      </div>

      <div className="pointer-events-none relative z-10 flex items-end gap-3 px-6 pb-[max(env(safe-area-inset-bottom),22px)]">
        <img src={mascotFor(story)} alt="" className="size-24 shrink-0 object-contain" />
        {slide.action && (
          <Link
            to={slide.action.to}
            onClick={onClose}
            className={cn(
              'pointer-events-auto mb-2 flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#8eb69b] px-5 text-center font-display text-[17px] font-extrabold text-[#051f20]',
            )}
          >
            {slide.action.label}
          </Link>
        )}
      </div>
    </div>,
    document.body,
  )
}
