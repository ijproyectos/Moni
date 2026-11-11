import { Coffee, Repeat, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import mascot from '@/assets/mascot/expresion_feliz.svg'
import { cn } from '@/shared/ui/cn'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useInsights } from '../api/useInsights'
import type { Insight, InsightKind } from '../domain/insights'

const LOOK: Record<InsightKind, { icon: LucideIcon; tile: string; kicker: string; label: string; to: string }> = {
  ant: {
    icon: Coffee,
    tile: 'bg-tint-gold text-warn-ink',
    kicker: 'text-warn-ink',
    label: 'Gasto hormiga',
    to: '/hormigas',
  },
  subscription: {
    icon: Repeat,
    tile: 'bg-tint-violet text-[#4A3F96] dark:text-ink',
    kicker: 'text-[#4A3F96] dark:text-text-muted',
    label: 'Suscripción',
    to: '/recurrentes',
  },
  unusual: {
    icon: TriangleAlert,
    tile: 'bg-tint-red text-bad-ink',
    kicker: 'text-bad-ink',
    label: 'Gasto inusual',
    to: '/este-mes',
  },
}

function Body({ insight }: { insight: Insight }) {
  switch (insight.kind) {
    case 'ant':
      return (
        <>
          <p className="text-[15.5px] font-semibold leading-[1.25]">
            {insight.labels.join(' + ')} = <AmountDisplay cents={insight.yearlyCents} /> al año
          </p>
          <p className="text-[13px] text-text-muted">
            Son unos <AmountDisplay cents={insight.weeklyCents} /> por semana en {insight.count}{' '}
            {insight.count === 1 ? 'compra chica' : 'compras chicas'}.
          </p>
        </>
      )
    case 'subscription':
      return (
        <>
          <p className="text-[15.5px] font-semibold leading-[1.25]">
            {insight.name} subió {insight.percent}%
          </p>
          <p className="text-[13px] text-text-muted">
            Pasó de <AmountDisplay cents={insight.fromCents} /> a <AmountDisplay cents={insight.toCents} />{' '}
            {insight.period === 'yearly' ? 'por año' : 'por mes'}.
          </p>
        </>
      )
    case 'unusual':
      return (
        <>
          <p className="text-[15.5px] font-semibold leading-[1.25]">
            {insight.categoryName}: <AmountDisplay cents={insight.currentCents} /> este mes
          </p>
          <p className="text-[13px] text-text-muted">
            Es un {insight.percent}% más que tu promedio de meses anteriores (
            <AmountDisplay cents={insight.averageCents} />
            ).
          </p>
        </>
      )
  }
}

function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const look = LOOK[insight.kind]
  const Icon = look.icon
  return (
    <li
      className={cn(
        'flex flex-col gap-[9px] rounded-[26px] bg-card px-3.5 py-3',
        insight.kind === 'unusual' && 'shadow-[inset_0_0_0_1.5px_var(--color-tint-red)]',
      )}
    >
      <div className="grid grid-cols-[38px_1fr] gap-3">
        <span aria-hidden="true" className={cn('flex size-[38px] items-center justify-center rounded-[12px]', look.tile)}>
          <Icon className="size-[18px]" strokeWidth={2} />
        </span>
        <div>
          <p className={cn('text-[11px] font-semibold uppercase tracking-[0.1em]', look.kicker)}>{look.label}</p>
          <Body insight={insight} />
        </div>
      </div>
      <div className="flex gap-1.5 pl-[50px]">
        <Link
          to={look.to}
          className={cn('rounded-full bg-chip px-3 py-1.5 text-[12.5px] font-medium', FOCUS_RING)}
        >
          Ver detalle
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className={cn('rounded-full px-2 py-1.5 text-[12.5px] text-text-muted', FOCUS_RING)}
        >
          Descartar
        </button>
      </div>
    </li>
  )
}

/** Lo que Moni detectó (screen 05): only insights with a real source (ants, subscription raises, unusual categories). */
export function InsightsPage() {
  const { isLoading, isError, insights, dismiss } = useInsights()
  return (
    <section className="flex flex-col gap-2.5 px-[18px] pb-4 pt-1.5">
      <header className="flex items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.03em]">Lo que Moni detectó</h1>
          <p className="text-[13px] text-text-muted">Este mes</p>
        </div>
        {insights.length > 0 && (
          <span className="rounded-full bg-mint-soft px-2.5 py-1 text-[12.5px] font-semibold text-mint-ink">
            {insights.length} {insights.length === 1 ? 'nuevo' : 'nuevos'}
          </span>
        )}
      </header>

      {isLoading ? (
        <div role="status" aria-label="Cargando avisos" className="flex flex-col gap-2.5">
          <Skeleton className="h-28 rounded-[26px]" />
          <Skeleton className="h-28 rounded-[26px]" />
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-[26px] bg-card px-4 py-5 text-center text-[13.5px] text-text-muted">
          No pudimos cargar los avisos. Revisá tu conexión y probá de nuevo.
        </p>
      ) : insights.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[26px] bg-card px-5 py-7 text-center">
          <img src={mascot} alt="" className="size-14 rounded-full" />
          <h2 className="text-[16px] font-semibold">Todo tranquilo por ahora</h2>
          <p className="text-[13px] text-text-muted">
            Cuando detecte algo en tus gastos, como una suscripción que subió o un gasto fuera de lo habitual, te lo
            muestro acá.
          </p>
        </div>
      ) : (
        <ul aria-label="Avisos" className="flex flex-col gap-2.5">
          {insights.map((i) => (
            <InsightCard key={i.key} insight={i} onDismiss={() => dismiss(i.key)} />
          ))}
        </ul>
      )}
    </section>
  )
}
