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
    <div className="flex min-h-dvh w-full flex-col bg-canvas text-ink">
      {/* Full-bleed header; the content keeps the phone width and centers on tall screens. */}
      <div className="rounded-b-[36px] bg-gradient-to-b from-forest to-surface text-cream">
        <div className="mx-auto flex w-full max-w-[430px] flex-col px-5 pb-6 pt-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-forest"
            >
              <X aria-hidden="true" className="size-6" strokeWidth={2} />
            </button>
          </div>
          <div className="mx-auto -mt-4 flex size-[clamp(84px,26vw,104px)] shrink-0 items-center justify-center rounded-full bg-black/25">
            <img src={mascotUrl} alt="" className="size-[78%]" />
          </div>
          <h1 className="mt-3 text-center font-display text-[clamp(28px,8.4vw,34px)] font-extrabold leading-tight">
            ¿Probás Moni Pro?
          </h1>
          <p className="mt-2 text-balance text-center text-[clamp(14px,4.1vw,16px)] leading-snug text-text-muted-on-dark">
            {PRO_TRIAL_DAYS} días gratis. Cancelás cuando quieras, sin cargo.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 min-[431px]:justify-center">
        <section aria-label="Con Pro tenés">
          <h2 className="sr-only">Con Pro tenés:</h2>
          <ul className="flex flex-col divide-y divide-line">
            {PRO_FEATURES.map((feature, i) => {
              const Icon = FEATURE_ICONS[i] ?? Check
              return (
                <li
                  key={feature}
                  className="flex min-h-12 items-center gap-3 py-1.5 text-[clamp(15px,4.2vw,17px)] font-extrabold leading-5"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-text-muted"
                    strokeWidth={2}
                  />
                  <span className="flex-1">{feature}</span>
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest text-cream dark:bg-lime dark:text-forest"
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
          className="mt-7 grid grid-cols-3 gap-1.5 min-[360px]:gap-2"
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
                  active
                    ? 'border-forest bg-[#e3ebd3] dark:border-lime dark:bg-sand'
                    : 'border-line bg-card',
                )}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 max-w-[calc(100%+4px)] -translate-x-1/2 truncate whitespace-nowrap rounded-full bg-gold px-1.5 py-0.5 text-[clamp(9px,2.9vw,11px)] font-extrabold uppercase text-forest min-[360px]:px-2">
                    {p.badge}
                  </span>
                )}
                <span className="whitespace-nowrap text-[clamp(13px,4vw,16px)] font-extrabold leading-5">
                  {p.name}
                </span>
                <span className="mt-1 whitespace-nowrap font-display text-[clamp(15px,4.8vw,19px)] font-extrabold leading-6">
                  {p.price}
                </span>
                <span className="mt-1 text-[clamp(11px,3.1vw,12px)] leading-4 text-text-muted">
                  {p.caption}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-balance text-center text-[14px] leading-5 text-text-muted">
          {trialFooter(plan)}
        </p>

        {error && (
          <p role="alert" className="mt-2 text-center text-sm font-bold text-expense">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onStartTrial}
          disabled={busy}
          className="mt-4 flex min-h-16 w-full flex-col items-center justify-center rounded-full bg-gradient-to-r from-forest to-surface py-2 text-cream disabled:opacity-60 dark:from-lime dark:to-[#c7f199] dark:text-forest"
        >
          <span className="text-[clamp(17px,5.2vw,19px)] font-extrabold leading-6">
            {plan.id === 'lifetime' ? 'Comprar Pro' : 'Empezar prueba gratis'}
          </span>
          <span className="text-[14px] font-bold opacity-90">Cancelás cuando quieras</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-2 min-h-11 text-[18px] font-extrabold text-text-muted"
        >
          Ahora no
        </button>
        <nav
          aria-label="Legales"
          className="mt-1 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[14px] text-text-muted underline [&>*]:whitespace-nowrap"
        >
          <button type="button">Restaurar compras</button>
          <a href="#terminos">Términos</a>
          <a href="#privacidad">Privacidad</a>
        </nav>
      </div>
    </div>
  )
}
