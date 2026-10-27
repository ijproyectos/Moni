import { useRef, useState } from 'react'
import mascotReport from '@/assets/mascot/personaje_informe-del-mes.svg'
import mascotGroups from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import mascotMoney from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'

// Only features inside the MVP are advertised.
const SLIDES = [
  {
    tag: 'Informe del mes',
    title: 'Mirá en qué se te va la plata',
    text: 'Gráficos por categoría y cómo venís este mes.',
    image: mascotReport,
  },
  {
    tag: 'Gastos en grupo',
    title: 'Dividí gastos sin hacer cuentas',
    text: 'Cargá lo que pagó cada uno y Moni te dice quién le debe a quién.',
    image: mascotGroups,
  },
  {
    tag: 'Carga de dinero',
    title: 'Anotá cada peso en segundos',
    text: 'Cargá un gasto o un ingreso en un toque y mirá cómo cambia tu balance.',
    image: mascotMoney,
  },
] as const

interface OnboardingBenefitsStepProps {
  /** First name from the profile; the heading degrades gracefully without it. */
  name: string
  onContinue: () => void
}

// Screen 03 — Así te va a ayudar Moni.
export function OnboardingBenefitsStep({ name, onContinue }: OnboardingBenefitsStepProps) {
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLUListElement>(null)

  function handleScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth))
  }

  return (
    <>
      <h1 className="mt-10 text-center font-display text-[32px] font-semibold leading-9 text-cream">
        {name ? `${name}, así te va a ayudar Moni` : 'Así te va a ayudar Moni'}
      </h1>
      <p className="mt-3 text-center text-[17px] leading-6 text-text-muted-on-dark">
        Lo armamos según lo que nos contaste.
      </p>

      <ul
        ref={trackRef}
        onScroll={handleScroll}
        aria-label="Beneficios de Moni"
        className="no-scrollbar mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {SLIDES.map((slide, i) => (
          <li
            key={slide.tag}
            aria-label={`${i + 1} de ${SLIDES.length}`}
            className="flex w-full shrink-0 snap-center flex-col items-center rounded-xl bg-canvas p-5 text-center"
          >
            <div className="flex aspect-[1.1] w-full items-center justify-center rounded-lg bg-cream">
              <img src={slide.image} alt="" className="h-[85%] w-auto" />
            </div>
            <span className="mt-5 rounded-full bg-lime/60 px-4 py-1 font-display text-sm font-semibold uppercase tracking-wide text-forest">
              {slide.tag}
            </span>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-7 text-forest">
              {slide.title}
            </h2>
            <p className="mt-2 text-[16px] leading-6 text-text-muted">{slide.text}</p>
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="mt-4 flex justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <span
            key={slide.tag}
            className={cn(
              'h-2 rounded-full transition-all',
              i === index ? 'w-6 bg-lime' : 'w-2 bg-surface',
            )}
          />
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Button onClick={onContinue}>¡De una!</Button>
      </div>
    </>
  )
}
