import { useRef, useState } from 'react'
import mascotBudget from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotAnts from '@/assets/mascot/personaje_asistente.svg'
import mascotTrips from '@/assets/mascot/personaje_carga-de-dinero.svg'
import mascotVoice from '@/assets/mascot/personaje_carga-por-voz.svg'
import mascotGroups from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import mascotReport from '@/assets/mascot/personaje_informe-del-mes.svg'
import mascotGoals from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { OnboardingTitle } from './OnboardingTitle'

// Screens 003-009 — Así te ayuda Moni.
const SLIDES = [
  {
    tag: 'Informe del mes',
    title: 'Mirá en qué se te va la plata',
    text: 'Gráficos por categoría y cómo venís contra el mes pasado.',
    image: mascotReport,
  },
  {
    tag: 'Carga por voz',
    title: 'Cargá varios gastos hablando',
    text: 'Decí todo junto, como te salga. Moni separa cada gasto y lo categoriza.',
    image: mascotVoice,
  },
  {
    tag: 'Gastos hormiga',
    title: 'Cazá los gastos hormiga',
    text: 'Cada semana te contamos qué cambió y dónde se repiten los gastitos.',
    image: mascotAnts,
  },
  {
    tag: 'Presupuestos y fijos',
    title: 'Frená antes de pasarte',
    text: 'Límites por categoría y control de suscripciones y gastos fijos.',
    image: mascotBudget,
  },
  {
    tag: 'Metas de ahorro',
    title: 'Ahorrá para lo que quieras',
    text: 'Contale tu objetivo y Moni calcula cuánto guardar por mes. Y si conviene pagar en cuotas.',
    image: mascotGoals,
  },
  {
    tag: 'Grupos',
    title: 'Dividí sin hacer cuentas',
    text: 'Quién puso cuánto y quién le debe a quién. Mandás el resumen por WhatsApp y listo.',
    image: mascotGroups,
  },
  {
    tag: 'Viajes',
    title: 'Viajá con la plata clara',
    text: 'Presupuesto por rubro, ahorro para el viaje y gastos en grupo.',
    image: mascotTrips,
  },
] as const

interface OnboardingBenefitsStepProps {
  /** First name from the profile; the heading degrades gracefully without it. */
  name: string
  onContinue: () => void
}

export function OnboardingBenefitsStep({ name, onContinue }: OnboardingBenefitsStepProps) {
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLUListElement>(null)
  const isLast = index === SLIDES.length - 1

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
        className="no-scrollbar -mr-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pr-5"
      >
        {SLIDES.map((slide, i) => (
          <li
            key={slide.tag}
            aria-label={`${i + 1} de ${SLIDES.length}`}
            className="flex w-[86%] shrink-0 snap-start flex-col items-center rounded-[28px] bg-canvas px-5 pb-7 pt-5 text-center"
          >
            <div className="flex aspect-[1.35] w-full items-center justify-center rounded-[22px] bg-cream">
              <img src={slide.image} alt="" className="h-[88%] w-auto" />
            </div>
            <span className="mt-4 rounded-full bg-lime/45 px-4 py-1 text-[13px] font-extrabold uppercase tracking-[0.08em] text-forest">
              {slide.tag}
            </span>
            <h2 className="mt-3 font-display text-[26px] font-extrabold leading-[30px] text-forest">
              {slide.title}
            </h2>
            <p className="mt-2 text-[15px] leading-[22px] text-text-muted">{slide.text}</p>
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="mt-4 flex justify-center gap-1.5">
        {SLIDES.map((slide, i) => (
          <span
            key={slide.tag}
            className={cn(
              'h-2 rounded-full transition-all',
              i === index ? 'w-7 bg-lime' : 'w-2 bg-surface',
            )}
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pt-5">
        <Button onClick={next}>{isLast ? 'Continuar' : 'Seguir'}</Button>
        {!isLast && (
          <Button variant="ghost" onClick={onContinue} className="text-text-muted-on-dark">
            Saltar
          </Button>
        )}
      </div>
    </>
  )
}
