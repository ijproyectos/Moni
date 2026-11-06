import { useEffect, useRef, useState } from 'react'
import mascotBudget from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotAnts from '@/assets/mascot/personaje_asistente.svg'
import mascotGroups from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import mascotGoals from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import mascotReport from '@/assets/mascot/personaje_informe-del-mes.svg'
import mascotTrips from '@/assets/mascot/personaje_carga-de-dinero.svg'
import mascotVoice from '@/assets/mascot/personaje_carga-por-voz.svg'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { OnboardingTitle } from './OnboardingTitle'
import { SkipAllLink } from './SkipAllLink'

/** Background of the whole screen while a slide is showing (light theme, dark theme). */
export interface SlideTint {
  light: string
  dark: string
}

// Screens 003-009 — Así te ayuda Moni. Each slide tints the screen and its tag with its own color.
const SLIDES = [
  {
    tag: 'Informe del mes',
    title: 'Mirá en qué se te va la plata',
    text: 'Gráficos por categoría y cómo venís contra el mes pasado.',
    image: mascotReport,
    tagColor: '#1f6b52',
    tint: { light: '#dce9c8', dark: '#1b2c1f' },
  },
  {
    tag: 'Carga por voz',
    title: 'Cargá varios gastos hablando',
    text: 'Decí todo junto, como te salga. Moni separa cada gasto y lo categoriza.',
    image: mascotVoice,
    tagColor: '#b9801a',
    tint: { light: '#f5e9c8', dark: '#2b2616' },
  },
  {
    tag: 'Gastos hormiga',
    title: 'Cazá los gastos hormiga',
    text: 'Cada semana te contamos qué cambió y dónde se repiten los gastitos.',
    image: mascotAnts,
    tagColor: '#c9573e',
    tint: { light: '#f6dcd0', dark: '#2d1d19' },
  },
  {
    tag: 'Presupuestos y fijos',
    title: 'Frená antes de pasarte',
    text: 'Límites por categoría y control de suscripciones, fijos y cuotas.',
    image: mascotBudget,
    tagColor: '#3a6ea5',
    tint: { light: '#d8e5f1', dark: '#17232d' },
  },
  {
    tag: 'Metas de ahorro',
    title: 'Ahorrá para lo que quieras',
    text: 'Contale tu objetivo y Moni calcula cuánto guardar por mes. Y si conviene pagar en cuotas.',
    image: mascotGoals,
    tagColor: '#6b4fc4',
    tint: { light: '#eae0f4', dark: '#231d2e' },
  },
  {
    tag: 'Grupos',
    title: 'Dividí sin hacer cuentas',
    text: 'Quién puso cuánto y quién le debe a quién. Mandás el resumen por WhatsApp y listo.',
    image: mascotGroups,
    tagColor: '#d9692a',
    tint: { light: '#fbe3cf', dark: '#2d2217' },
  },
  {
    tag: 'Viajes',
    title: 'Viajá con la plata clara',
    text: 'Presupuesto por rubro, ahorro para el viaje y gastos en grupo.',
    image: mascotTrips,
    tagColor: '#1f8a6b',
    tint: { light: '#d3eadf', dark: '#16281f' },
  },
] as const

interface OnboardingBenefitsStepProps {
  /** First name from the profile; the heading degrades gracefully without it. */
  name: string
  onContinue: () => void
  /** Skips what is left of the slides and goes on to the next step. */
  onSkip: () => void
  /** Asks to finish the whole onboarding with the defaults. */
  onSkipAll: () => void
  /** The screen takes the tint of the slide on view; null when the step goes away. */
  onTint?: (tint: SlideTint | null) => void
  isBusy?: boolean
}

export function OnboardingBenefitsStep({
  name,
  onContinue,
  onSkip,
  onSkipAll,
  onTint,
  isBusy = false,
}: OnboardingBenefitsStepProps) {
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLUListElement>(null)
  const isLast = index === SLIDES.length - 1

  useEffect(() => {
    onTint?.(SLIDES[index]?.tint ?? null)
  }, [index, onTint])
  useEffect(() => () => onTint?.(null), [onTint])

  function slideWidth(track: HTMLUListElement) {
    const first = track.firstElementChild as HTMLElement | null
    return first ? first.offsetWidth + 12 : track.clientWidth
  }

  function handleScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setIndex(Math.min(SLIDES.length - 1, Math.round(track.scrollLeft / slideWidth(track))))
  }

  function next() {
    if (isLast) return onContinue()
    const track = trackRef.current
    const target = index + 1
    setIndex(target)
    track?.scrollTo?.({ left: target * slideWidth(track), behavior: 'smooth' })
  }

  return (
    <>
      <OnboardingTitle
        title={name ? `${name}, así te va a ayudar Moni` : 'Así te va a ayudar Moni'}
        subtitle="Lo armamos según lo que nos contaste."
      />

      <ul
        ref={trackRef}
        onScroll={handleScroll}
        aria-label="Beneficios de Moni"
        className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5"
      >
        {SLIDES.map((slide, i) => (
          <li
            key={slide.tag}
            aria-label={`${i + 1} de ${SLIDES.length}`}
            className="flex w-full shrink-0 snap-center flex-col items-center px-1 text-center"
          >
            <div className="relative w-[88%]">
              <div
                aria-hidden="true"
                className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-[24px] bg-forest dark:bg-lime/40"
              />
              <div className="relative flex aspect-[1.3] w-full -rotate-1 items-center justify-center rounded-[24px] border-[3px] border-forest bg-[#fff2d8] dark:border-lime/60">
                <img src={slide.image} alt="" className="h-[90%] w-auto" />
              </div>
            </div>
            <span
              className="mt-6 rounded-full px-4 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em] text-white"
              style={{ backgroundColor: slide.tagColor }}
            >
              {slide.tag}
            </span>
            <h2 className="mt-3 text-balance font-display text-[28px] font-extrabold leading-8 text-ink">
              {slide.title}
            </h2>
            <p className="mt-2 text-balance text-[15px] leading-[22px] text-text-muted">
              {slide.text}
            </p>
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="mt-5 flex justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <span
            key={slide.tag}
            className={cn(
              'h-2 rounded-full transition-all',
              i === index ? 'w-6 bg-forest dark:bg-lime' : 'w-2 bg-forest/20 dark:bg-white/20',
            )}
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pt-6">
        <Button onClick={next}>{isLast ? 'Continuar' : 'Seguir'}</Button>
        <Button variant="ghost" disabled={isBusy} onClick={onSkip} className="text-text-muted">
          Saltar
        </Button>
        <SkipAllLink disabled={isBusy} onClick={onSkipAll} />
      </div>
    </>
  )
}
