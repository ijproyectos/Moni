import {
  Ban,
  Camera,
  Check,
  ChartPie,
  Mic,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import mascotUrl from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import { cn } from '@/shared/ui/cn'
import {
  PRO_FEATURES,
  PRO_PLANS,
  PRO_TRIAL_DAYS,
  trialFooter,
  type ProPlanId,
} from '../domain/plans'

const FEATURE_ICONS: LucideIcon[] = [WalletCards, Mic, Camera, ChartPie, UsersRound, Ban]

interface ProPaywallProps {
  onClose: () => void
  /** Simulated: there is no billing yet, so starting the trial only closes the screen. */
  onStartTrial: () => void
  busy?: boolean
  error?: string | null
}

// Screen 013 — Moni Pro. Shown at the end of onboarding and from Más.
export function ProPaywall({ onClose, onStartTrial, busy, error }: ProPaywallProps) {
  const [planId, setPlanId] = useState<ProPlanId>('annual')
  const plan = PRO_PLANS.find((p) => p.id === planId) ?? PRO_PLANS[0]
  if (!plan) return null

  return (
    <div className="flex min-h-dvh w-full flex-col bg-forest text-cream">
      {/* Full-bleed background; the content keeps the phone width and centers on tall screens. */}
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-6 min-[431px]:justify-center">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-cream"
          >
            <X aria-hidden="true" className="size-6" strokeWidth={2} />
          </button>
        </div>
        <img
          src={mascotUrl}
          alt=""
          className="mx-auto -mt-6 size-[clamp(72px,24vw,92px)] shrink-0"
        />
        <h1 className="mt-2 text-center font-display text-[clamp(26px,8.2vw,32px)] font-extrabold leading-tight">
          ¿Probás Moni Pro?
        </h1>
        <p className="mt-2 text-balance text-center text-[clamp(14px,4.1vw,16px)] leading-snug text-text-muted-on-dark">
          {PRO_TRIAL_DAYS} días gratis. Cancelás cuando quieras, sin cargo.
        </p>

        <section className="mt-5 rounded-[24px] border border-lime/20 bg-surface/60 px-4 py-4 min-[360px]:px-5">
          <h2 className="text-[16px] font-bold text-text-muted-on-dark">Con Pro tenés:</h2>
          <ul className="mt-2 flex flex-col">
            {PRO_FEATURES.map((feature, i) => {
              const Icon = FEATURE_ICONS[i] ?? Check
              return (
                <li
                  key={feature}
                  className="flex min-h-10 items-center gap-3 py-1 text-[clamp(14px,4.1vw,16px)] leading-5"
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2} />
                  <span className="flex-1">{feature}</span>
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime text-forest"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <div
          role="radiogroup"
          aria-label="Plan"
          className="mt-6 grid grid-cols-3 gap-1.5 min-[360px]:gap-2"
        >
          {PRO_PLANS.map((p) => {
            const active = p.id === planId
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPlanId(p.id)}
                className={cn(
                  'relative flex min-w-0 flex-col items-center justify-start rounded-[20px] border-2 px-1 pb-3 pt-5 text-center',
                  active ? 'border-lime bg-surface' : 'border-lime/15 bg-transparent',
                )}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 max-w-[calc(100%+4px)] -translate-x-1/2 truncate whitespace-nowrap rounded-full bg-lime px-1.5 py-0.5 text-[clamp(9px,2.9vw,11px)] font-extrabold uppercase text-forest min-[360px]:px-2">
                    {p.badge}
                  </span>
                )}
                <span className="whitespace-nowrap text-[clamp(13px,4vw,16px)] font-extrabold leading-5">
                  {p.name}
                </span>
                <span className="mt-1 whitespace-nowrap text-[clamp(14px,4.5vw,18px)] font-extrabold leading-6">
                  {p.price}
                </span>
                <span className="mt-1 text-[clamp(11px,3.1vw,12px)] leading-4 text-text-muted-on-dark">
                  {p.caption}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-balance text-center text-[14px] leading-5 text-text-muted-on-dark">
          {trialFooter(plan)}
        </p>

        {error && (
          <p role="alert" className="mt-2 text-center text-sm text-blush">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onStartTrial}
          disabled={busy}
          className="mt-4 flex min-h-16 w-full flex-col items-center justify-center rounded-full bg-lime py-2 text-forest disabled:opacity-60"
        >
          <span className="text-[clamp(17px,5.2vw,19px)] font-extrabold leading-6">
            {plan.id === 'lifetime' ? 'Comprar Pro' : 'Empezar prueba gratis'}
          </span>
          <span className="text-[14px] font-bold">Cancelás cuando quieras</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-2 min-h-11 text-[18px] font-extrabold"
        >
          Ahora no
        </button>
        <nav
          aria-label="Legales"
          className="mt-1 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[14px] underline [&>*]:whitespace-nowrap"
        >
          <button type="button">Restaurar compras</button>
          <a href="#terminos">Términos</a>
          <a href="#privacidad">Privacidad</a>
        </nav>
      </div>
    </div>
  )
}
