import { useState } from 'react'
import { useNavigate } from 'react-router'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useMarkRewardsSeen, useRewards } from '../api/useSavings'
import { hasCelebration, pendingCelebration } from '../domain/badges'
import { BadgeImage } from './BadgeImage'

const CONFETTI = ['#b8ec7c', '#ffc83d', '#f5b8b0', '#2f9e8f', '#e5533d', '#8a6bd1']

/** A short, gentle burst of confetti behind the card. Skipped when the person asks for less motion. */
function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 hidden h-72 overflow-hidden motion-safe:block"
    >
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2 rounded-[2px] opacity-0 motion-safe:animate-[confetti-fall_1.9s_ease-in_2]"
          style={{
            left: `${(i * 47 + 8) % 100}%`,
            backgroundColor: CONFETTI[i % CONFETTI.length],
            animationDelay: `${(i % 7) * 110}ms`,
            animationFillMode: 'forwards',
          }}
        />
      ))}
    </div>
  )
}

/**
 * The celebration when a goal is really reached and when a badge is earned. It shows once: what is on screen is marked
 * as seen when the person closes it, and it can be closed at any moment.
 */
export function RewardCelebration() {
  const rewards = useRewards()
  const markSeen = useMarkRewardsSeen()
  const navigate = useNavigate()
  const [closed, setClosed] = useState(false)
  const [index, setIndex] = useState(0)

  const pending = pendingCelebration(rewards.data?.achievements ?? [], rewards.data?.badges ?? [])
  if (closed || !hasCelebration(pending)) return null

  const slides = [
    ...pending.achievements.map((a) => ({ type: 'goal' as const, id: a.id, goal: a })),
    ...pending.badges.map((b) => ({ type: 'badge' as const, id: b.earned.key, badge: b })),
  ]
  const slide = slides[Math.min(index, slides.length - 1)]
  if (!slide) return null
  const last = index >= slides.length - 1

  function close(toAchievements = false) {
    setClosed(true)
    markSeen.mutate()
    if (toAchievements) navigate('/logros')
  }

  return (
    <BottomSheet
      title={slide.type === 'goal' ? '¡Meta cumplida!' : '¡Nueva insignia!'}
      onClose={() => close()}
    >
      <div className="relative flex flex-col items-center gap-3 pb-1 text-center">
        <Confetti />
        {slide.type === 'goal' ? (
          <>
            <img
              src={mascotHappy}
              alt=""
              className="relative size-32 motion-safe:animate-[badge-pop_600ms_ease-out]"
            />
            <p className="relative text-[20px] font-extrabold leading-7">
              ¡Felicitaciones! Llegaste al 100% de tu meta {slide.goal.goalName}.
            </p>
            <p className="relative text-[16px] text-text-muted">
              Juntaste {formatArs(slide.goal.targetCents)}. Lo que reservaste se queda en tu cuenta.
            </p>
          </>
        ) : (
          <>
            <BadgeImage
              badgeKey={slide.badge.def.key}
              className="relative size-44 motion-safe:animate-[badge-pop_700ms_ease-out]"
            />
            <p className="relative text-[22px] font-extrabold leading-7">{slide.badge.def.name}</p>
            <p className="relative text-[16px] leading-6 text-text-muted">
              {slide.badge.def.congrats}
            </p>
            {slide.badge.earned.goalName && (
              <p className="relative text-[15px] text-text-muted">
                Meta: {slide.badge.earned.goalName}
              </p>
            )}
          </>
        )}
        <div className="relative mt-2 flex w-full flex-col gap-2">
          {last ? (
            <>
              <Button onClick={() => close(true)}>Ver mis logros</Button>
              <Button variant="ghost" className="text-ink" onClick={() => close()}>
                Seguir
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setIndex((i) => i + 1)}>Siguiente</Button>
              <Button variant="ghost" className="text-ink" onClick={() => close()}>
                Cerrar
              </Button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
