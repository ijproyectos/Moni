import { formatArs, type Cents } from '@/shared/lib/money'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { Kicker } from '@/shared/ui/Kicker'
import { Skeleton } from '@/shared/ui/Skeleton'
import { StatusChip, type StatusChipTone } from '@/shared/ui/StatusChip'
import type { DailyAllowanceView } from '../api/useDailyAllowance'
import type { DailyAllowanceData } from '../domain/dailyAllowance'
import { DAY_STATUS_LABELS, type DayStatus, type MonthPace } from '../domain/monthPace'

const CHIP_TONE: Record<DayStatus, StatusChipTone> = {
  'vas-bien': 'ok',
  ajustado: 'warn',
  'te-pasaste': 'bad',
}

interface HomeHeroProps {
  view: DailyAllowanceView
  /** Empty state action: leads to loading income. */
  onAddIncome: () => void
}

function contextLine(status: DayStatus, a: DailyAllowanceData, pace: MonthPace): string {
  if (status === 'te-pasaste') {
    return a.daysLeft > 1
      ? `Tranqui: se acomoda en los ${a.daysLeft} días que quedan. Ajustá lo que puedas y listo.`
      : 'Tranqui: es el último día del mes, mañana arranca uno nuevo.'
  }
  const gap = Math.abs(pace.deviationCents)
  if (status === 'ajustado') {
    return pace.aheadOfPace
      ? `Vas ${formatArs(gap)} por encima de tu ritmo. Con ${formatArs(a.dailyCents)} hoy llegás a fin de mes.`
      : `Vas justo con tu ritmo. Con ${formatArs(a.dailyCents)} hoy llegás bien a fin de mes.`
  }
  if (gap === 0) return 'Vas justo con tu ritmo del mes.'
  return pace.aheadOfPace
    ? `Vas ${formatArs(gap)} por encima de tu ritmo del mes, pero todavía llegás bien.`
    : `Vas ${formatArs(gap)} por debajo de tu ritmo del mes.`
}

function PaceBar({ pace, allowance }: { pace: MonthPace; allowance: DailyAllowanceData }) {
  const spentPct = Math.round(pace.spentShare * 100)
  return (
    <div className="mt-5">
      <div
        role="img"
        aria-label={`Ritmo del mes: llevás gastado el ${spentPct}% de lo previsto y estás en el día ${allowance.dayOfMonth} de ${allowance.daysInMonth}.`}
        className="relative h-2.5 rounded-full bg-white/25"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-white"
          style={{ width: `${pace.spentShare * 100}%` }}
        />
        <span
          aria-hidden="true"
          data-testid="pace-marker"
          className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-[#FFE58A]"
          style={{ left: `${pace.dayPosition * 100}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px] text-[#CBEBD9]">
        <span>
          Gastado <AmountDisplay cents={pace.spentCents} />
        </span>
        <span>
          Día {allowance.dayOfMonth} de {allowance.daysInMonth}
        </span>
      </div>
    </div>
  )
}

const HERO = 'rounded-[30px] bg-mint px-5 pb-5 pt-5 text-white'

/**
 * "Hoy podés gastar": the daily allowance from the person's real data, the state of the day and the pace of the month.
 * Without income there is nothing honest to compute, so it says so and leads to loading it.
 */
export function HomeHero({ view, onAddIncome }: HomeHeroProps) {
  const { allowance, status, pace, isLoading } = view
  if (allowance.kind === 'sin-datos') {
    if (isLoading) {
      return (
        <div className="mx-[18px]" role="status" aria-label="Calculando tu día">
          <Skeleton className="h-52 rounded-[30px]" />
        </div>
      )
    }
    return (
      <section aria-labelledby="hero-title" className={cn('mx-[18px]', HERO)}>
        <Kicker as="h2" className="text-[#DDF3E6]">
          <span id="hero-title">Hoy podés gastar</span>
        </Kicker>
        <p className="mt-2 font-display text-[26px] font-bold leading-tight tracking-[-0.02em]">
          Todavía no sabemos cuánto
        </p>
        <p className="mt-2 text-[14.5px] text-[#DDF3E6]">
          Cargá tus ingresos y Moni calcula cuánto podés gastar por día sin pasarte a fin de mes.
        </p>
        <button
          type="button"
          onClick={onAddIncome}
          className="mt-4 flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-bold text-mint-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Cargar ingresos
        </button>
      </section>
    )
  }

  const over = status === 'te-pasaste' && allowance.overCents > 0
  const kicker = over ? 'Pasaste tu presupuesto por' : 'Hoy podés gastar'
  const figure = over ? allowance.overCents : allowance.dailyCents
  return (
    <section aria-labelledby="hero-title" className={cn('mx-[18px]', HERO)} data-status={status}>
      <div className="flex items-start justify-between gap-3">
        <Kicker as="h2" className="pt-1.5 text-[#DDF3E6]">
          <span id="hero-title">{kicker}</span>
        </Kicker>
        {status && <StatusChip tone={CHIP_TONE[status]}>{DAY_STATUS_LABELS[status]}</StatusChip>}
      </div>
      <Figure cents={figure} />
      {status && pace && (
        <p className="mt-3 text-[14.5px] leading-snug text-[#DDF3E6]">
          {contextLine(status, allowance, pace)}
        </p>
      )}
      {pace && <PaceBar pace={pace} allowance={allowance} />}
    </section>
  )
}

/** The big figure: pesos at full size, the decimals at ~55% (only when the amount has cents). */
function Figure({ cents }: { cents: Cents }) {
  const { hidden } = useHiddenAmounts()
  const [whole = '', decimals] = formatArs(cents).split(',')
  return (
    <p
      className="mt-2 font-display text-[clamp(40px,13vw,52px)] font-bold leading-none tracking-[-0.04em] tabular-nums"
      data-testid="hero-figure"
    >
      {hidden ? (
        <AmountDisplay cents={cents} />
      ) : (
        <>
          {whole}
          {decimals && <span className="text-[0.55em]">,{decimals}</span>}
        </>
      )}
    </p>
  )
}
