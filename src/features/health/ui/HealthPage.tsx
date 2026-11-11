import type { ReactNode } from 'react'
import { Link } from 'react-router'
import mascot from '@/assets/mascot/expresion_feliz.svg'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { formatMonthName, formatMonthYear, monthNameOf } from '@/shared/lib/dates'
import { monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MINT_PILL } from '@/shared/ui/mentaStyles'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useFinancialHealth, type FinancialHealth } from '../api/useFinancialHealth'
import {
  BAND_LABELS,
  type FactorTone,
  type HealthFactor,
  type HealthSuggestion,
} from '../domain/healthScore'

const RING = { size: 136, stroke: 14 }
const RADIUS = (RING.size - RING.stroke) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const CHIP: Record<FactorTone, string> = {
  ok: 'bg-ok-bg text-ok-ink',
  warn: 'bg-warn-bg text-warn-ink',
  bad: 'bg-bad-bg text-bad-ink',
}
const FILL: Record<FactorTone, string> = {
  ok: 'bg-mint-ink',
  warn: 'bg-[#E8B931]',
  bad: 'bg-bad-ink',
}

function percentText(value: number): string {
  return `${Math.round(value * 100)}%`
}

function deltaText(delta: number | null, previousMonth: string): string | null {
  if (delta === null) return null
  const name = monthNameOf(previousMonth).toLowerCase()
  if (delta === 0) return `Igual que en ${name}`
  const points = Math.abs(delta) === 1 ? 'punto' : 'puntos'
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${points} vs ${name}`
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="relative size-[136px] shrink-0">
      <svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={RING.size / 2} cy={RING.size / 2} r={RADIUS} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={RING.stroke} />
        <circle
          data-testid="health-arc"
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={RADIUS}
          fill="none"
          stroke="#FFE58A"
          strokeWidth={RING.stroke}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[40px] font-bold leading-none tracking-[-0.04em] text-white">{score}</span>
        <span className="text-[12px] text-[#DDF3E6]">de 100</span>
      </div>
    </div>
  )
}

function Evolution({ health, latest }: { health: FinancialHealth; latest: string }) {
  return (
    <>
      <div
        role="img"
        aria-label={`Evolución de los últimos ${health.series.length} meses: ${health.series
          .map((p) => `${formatMonthName(p.month)} ${p.score ?? 'sin dato'}`)
          .join(', ')}`}
        className="grid h-[58px] grid-cols-6 items-end gap-[5px]"
      >
        {health.series.map((p) => (
          <span
            key={p.month}
            aria-hidden="true"
            className={cn('rounded-full', p.month === latest ? 'bg-[#FFE58A]' : 'bg-white/[.22]')}
            style={{ height: p.score === null ? 4 : Math.max(6, Math.round((p.score / 100) * 58)) }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="grid grid-cols-6 gap-[5px] text-center text-[10px] text-[#CBEBD9]">
        {health.series.map((p) => (
          <span key={p.month} className={cn(p.month === latest && 'font-semibold text-white')}>
            {formatMonthName(p.month).slice(0, 3)}
          </span>
        ))}
      </div>
    </>
  )
}

function FactorRow({ factor, last }: { factor: HealthFactor; last: boolean }) {
  const hasData = factor.value !== null && factor.tone !== null
  return (
    <li className={cn('flex flex-col gap-[7px] py-[11px]', !last && 'border-b border-line')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14.5px] font-medium">
          {factor.label} <span className="text-[12px] font-normal text-text-muted">· {factor.goalLabel}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{hasData ? percentText(factor.value as number) : '—'}</span>
          {hasData && factor.tone && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', CHIP[factor.tone])}>
              {factor.toneLabel}
            </span>
          )}
        </span>
      </div>
      <div
        role="img"
        aria-label={
          hasData
            ? `${factor.label}: ${percentText(factor.value as number)}, ${factor.goalLabel}`
            : `${factor.label}: sin datos todavía`
        }
        className="relative h-[7px] rounded-full bg-line"
      >
        {hasData && factor.tone && (
          <>
            <span
              aria-hidden="true"
              className={cn('absolute inset-y-0 left-0 rounded-full', FILL[factor.tone])}
              style={{ width: `${factor.fill * 100}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute -top-[3px] h-[13px] w-0.5 bg-ink"
              style={{ left: `${factor.markerPosition * 100}%` }}
            />
          </>
        )}
      </div>
    </li>
  )
}

const REDUCE_COPY: Record<'installments' | 'fixed' | 'budget', (value: number) => { title: string; body: string }> = {
  installments: (v) => ({
    title: 'Las cuotas pesan en tu mes',
    body: `Representan el ${percentText(v)} de tus ingresos; lo sano es hasta el 20%. Evitá sumar cuotas nuevas por ahora.`,
  }),
  fixed: (v) => ({
    title: 'Tus gastos fijos están altos',
    body: `Son el ${percentText(v)} de tus ingresos; lo sano es hasta el 35%. Revisá suscripciones y servicios que no uses.`,
  }),
  budget: (v) => ({
    title: 'Ajustá tus presupuestos',
    body: `Cumplís el ${percentText(v)} de tus límites; la meta es 80%. Mirá cuáles te pasaste y reacomodalos.`,
  }),
}

function Suggestion({ suggestion }: { suggestion: HealthSuggestion }) {
  let title: ReactNode
  let body: ReactNode
  if (suggestion.kind === 'save') {
    title = (
      <>
        Separá <AmountDisplay cents={suggestion.amountCents} /> el día que cobrás
      </>
    )
    body = `Tu ahorro pasa de ${percentText(suggestion.fromRate)} a ${percentText(suggestion.toRate)} y el puntaje sube a ${suggestion.newScore}.`
  } else if (suggestion.kind === 'reduce') {
    const copy = REDUCE_COPY[suggestion.factor](suggestion.value)
    title = copy.title
    body = copy.body
  } else {
    title = 'Venís muy bien'
    body = 'Tus cuatro factores están en meta. Mantené el ritmo.'
  }
  return (
    <section aria-label="Sugerencia" className="flex gap-3 rounded-[26px] bg-gold p-3.5">
      <img src={mascot} alt="" className="size-9 shrink-0 rounded-full" />
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold text-[#2F3A24]">{title}</span>
        <span className="text-[13px] text-[#3F4A33] [text-wrap:pretty]">{body}</span>
      </div>
    </section>
  )
}

/** Salud financiera (screen 06): score 0-100, six-month evolution, four factors and one suggestion, all from real data. */
export function HealthPage() {
  const health = useFinancialHealth()
  const { openNew } = useMovementSheet()
  const latest = monthStart(todayIso())
  const previous = shiftMonth(latest, -1)

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader title="Salud financiera" subtitle={formatMonthYear(latest)} backTo="/perfil" />

      {health.isLoading ? (
        <div role="status" aria-label="Cargando salud financiera" className="flex flex-col gap-3">
          <Skeleton className="h-[172px] rounded-[30px]" />
          <Skeleton className="h-64 rounded-[28px]" />
        </div>
      ) : health.score.kind === 'sin-datos' ? (
        <section className="flex flex-col items-center gap-3 rounded-[30px] bg-card px-5 py-7 text-center">
          <img src={mascot} alt="" className="size-14 rounded-full" />
          <h2 className="text-[17px] font-semibold">Todavía no podemos medir tu salud financiera</h2>
          <p className="text-[13.5px] text-text-muted">
            Necesitamos tus ingresos para calcular cuánto ahorrás y cuánto pesan tus gastos fijos y tus cuotas.
          </p>
          <button type="button" onClick={() => openNew('income')} className={cn(MINT_PILL, 'h-12 text-[15px] font-semibold')}>
            Cargar un ingreso
          </button>
          <Link
            to="/ingresos"
            className="text-[13.5px] font-medium text-mint-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
          >
            Ver ingresos por mes
          </Link>
        </section>
      ) : (
        <>
          <section
            aria-label="Puntaje"
            className="grid grid-cols-[136px_1fr] items-center gap-4 rounded-[30px] bg-mint p-[18px] text-white"
          >
            <ScoreRing score={health.score.score} />
            <div className="flex min-w-0 flex-col gap-2">
              <div>
                <h2 className="text-[17px] font-semibold">{BAND_LABELS[health.score.band]}</h2>
                {deltaText(health.delta, previous) && (
                  <p className="text-[12.5px] text-[#DDF3E6]">{deltaText(health.delta, previous)}</p>
                )}
              </div>
              <Evolution health={health} latest={latest} />
            </div>
          </section>

          <ul aria-label="Factores" className="rounded-[28px] bg-card px-4 py-1.5">
            {health.score.factors.map((f, i, all) => (
              <FactorRow key={f.id} factor={f} last={i === all.length - 1} />
            ))}
          </ul>

          {health.suggestion && <Suggestion suggestion={health.suggestion} />}
        </>
      )}
    </section>
  )
}
