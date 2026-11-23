import { useEffect, useMemo, useRef, useState } from 'react'
import mascotAgent from '@/assets/mascot/personaje_asistente.svg'
import mascotGroups from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import mascotGoals from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import mascotReport from '@/assets/mascot/personaje_informe-del-mes.svg'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { OnboardingTitle } from './OnboardingTitle'

/** Background of the whole screen while a card is showing (light theme, dark theme). */
export interface SlideTint {
  light: string
  dark: string
}

interface Benefit {
  id: 'control' | 'ahorro' | 'compartidos' | 'agente'
  tag: string
  title: string
  text: string
  image: string
  tagColor: string
  tint: SlideTint
  /** Goals that make this benefit "for you". */
  goals: readonly string[]
}

const BENEFITS: readonly Benefit[] = [
  {
    id: 'control',
    tag: 'Control de gastos',
    title: 'Mirá en qué se te va la plata',
    text: 'Cargás un gasto en segundos y ves cada mes tus categorías, tus gastos fijos y los gastos hormiga.',
    image: mascotReport,
    tagColor: '#1f6b52',
    tint: { light: '#dce9c8', dark: '#1b2c1f' },
    goals: ['track_spending', 'control_recurring'],
  },
  {
    id: 'ahorro',
    tag: 'Ahorros y metas',
    title: 'Ahorrá para lo que quieras',
    text: 'Creá metas, anotá tus ahorros y mirá cuánto llevás. También para tus viajes.',
    image: mascotGoals,
    tagColor: '#6b4fc4',
    tint: { light: '#eae0f4', dark: '#231d2e' },
    goals: ['save_monthly', 'plan_trips'],
  },
  {
    id: 'compartidos',
    tag: 'Gastos compartidos',
    title: 'Dividí sin hacer cuentas',
    text: 'Quién puso cuánto y quién le debe a quién, con tu pareja, familia o amigos.',
    image: mascotGroups,
    tagColor: '#d9692a',
    tint: { light: '#fbe3cf', dark: '#2d2217' },
    goals: ['split_expenses', 'plan_trips'],
  },
  {
    id: 'agente',
    tag: 'Agente financiero',
    title: 'Preguntale a Moni',
    text: 'Consultale por tus finanzas y pedile ayuda para decidir antes de gastar.',
    image: mascotAgent,
    tagColor: '#b9801a',
    tint: { light: '#f5e9c8', dark: '#2b2616' },
    goals: [],
  },
]

/** The four benefits, the ones that match what the person chose first. */
function ordered(goals: readonly string[]): { benefit: Benefit; forYou: boolean }[] {
  const items = BENEFITS.map((benefit) => ({ benefit, forYou: benefit.goals.some((g) => goals.includes(g)) }))
  return [...items.filter((i) => i.forYou), ...items.filter((i) => !i.forYou)]
}

interface OnboardingBenefitsStepProps {
  /** First name from the profile; the heading degrades gracefully without it. */
  name: string
  goals: readonly string[]
  onContinue: () => void
  /** The screen takes the tint of the card on view; null when the step goes away. */
  onTint?: (tint: SlideTint | null) => void
}

// Step 2 — Beneficios de Moni: four cards in a horizontal carousel, one at a time, swipeable.
export function OnboardingBenefitsStep({ name, goals, onContinue, onTint }: OnboardingBenefitsStepProps) {
  const items = useMemo(() => ordered(goals), [goals])
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    onTint?.(items[index]?.benefit.tint ?? null)
  }, [index, items, onTint])
  useEffect(() => () => onTint?.(null), [onTint])

  function cardWidth(track: HTMLUListElement) {
    const first = track.firstElementChild as HTMLElement | null
    return first ? first.offsetWidth + 12 : track.clientWidth
  }

  function handleScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setIndex(Math.min(items.length - 1, Math.round(track.scrollLeft / cardWidth(track))))
  }

  function goTo(target: number) {
    const track = trackRef.current
    setIndex(target)
    track?.scrollTo?.({ left: target * cardWidth(track), behavior: 'smooth' })
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
        {items.map(({ benefit, forYou }, i) => (
          <li
            key={benefit.id}
            aria-label={`${i + 1} de ${items.length}`}
            className="flex w-full shrink-0 snap-center flex-col items-center px-1 text-center"
          >
            <div className="relative w-[88%]">
              <div aria-hidden="true" className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-[24px] bg-forest dark:bg-lime/40" />
              <div className="relative flex aspect-[1.3] w-full -rotate-1 items-center justify-center rounded-[24px] border-[3px] border-forest bg-[#fff2d8] dark:border-lime/60">
                <img src={benefit.image} alt="" className="h-[90%] w-auto" />
              </div>
            </div>
            <span
              className="mt-6 rounded-full px-4 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em] text-white"
              style={{ backgroundColor: benefit.tagColor }}
            >
              {benefit.tag}
            </span>
            {forYou && <span className="mt-2 text-[12.5px] font-extrabold text-income">Elegiste esto</span>}
            <h2 className="mt-3 text-balance font-display text-[28px] font-extrabold leading-8 text-ink">{benefit.title}</h2>
            <p className="mt-2 text-balance text-[15px] leading-[22px] text-text-muted">{benefit.text}</p>
          </li>
        ))}
      </ul>

      <div role="group" aria-label="Posición" className="mt-5 flex justify-center">
        {items.map(({ benefit }, i) => (
          <button
            key={benefit.id}
            type="button"
            aria-label={`Ir al beneficio ${i + 1} de ${items.length}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => goTo(i)}
            className="flex size-6 items-center justify-center"
          >
            <span
              className={cn(
                'h-2 rounded-full transition-all',
                i === index ? 'w-6 bg-forest dark:bg-lime' : 'w-2 bg-forest/20 dark:bg-white/20',
              )}
            />
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pt-6">
        <Button onClick={onContinue}>Continuar</Button>
      </div>
    </>
  )
}
