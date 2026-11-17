import { formatArs, type Cents } from '@/shared/lib/money'
import { AmountDisplay, MASK } from '@/shared/ui/AmountDisplay'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import type { DailyAllowanceView } from '../api/useDailyAllowance'
import { DAY_STATUS_LABELS } from '../domain/monthPace'

interface HomeHeroProps {
  view: DailyAllowanceView
  /** What the person has: the real sum of their payment methods and how many there are. */
  balance: { totalCents: Cents; methodCount: number }
  /** Empty state action: leads to loading income. */
  onAddIncome: () => void
}

/**
 * "Lo que tenés": the real total of the payment methods; below it, the chip with "Hoy podés gastar" and the state of the day.
 * Without income there is nothing honest to compute for the day, so the chip says so and leads to loading it.
 */
export function HomeHero({ view, balance, onAddIncome }: HomeHeroProps) {
  const { allowance, status, isLoading } = view
  const { hidden, toggle } = useHiddenAmounts()
  const over = status === 'te-pasaste' && allowance.kind !== 'sin-datos' && allowance.overCents > 0
  const dot =
    status === 'te-pasaste' ? 'bg-[#9E2F24]' : status === 'ajustado' ? 'bg-[#B8651B]' : 'bg-[#0B3D2E]'
  return (
    <section
      aria-labelledby="hero-title"
      data-status={status}
      className="relative mx-[18px] flex flex-col gap-1.5 overflow-hidden [container-type:inline-size] rounded-[32px] bg-[#0B3D2E] px-[26px] pb-6 pt-[26px] text-[#F1EEDD]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 size-64 rounded-full bg-[radial-gradient(circle,rgba(176,148,60,0.45),transparent_70%)]"
      />
      <div className="relative flex items-start justify-between gap-2">
        <h2 id="hero-title" className="pt-3 text-[13px] font-extrabold uppercase tracking-[0.2em] text-[#C9D2BF]">
          Lo que tenés
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
          className="min-h-11 rounded-full bg-white/10 px-[22px] text-[15px] font-bold text-[#C9D2BF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F1EEDD]"
        >
          {hidden ? 'Mostrar' : 'Ocultar'}
        </button>
      </div>
      <Figure cents={balance.totalCents} />
      <p className="relative text-[17px] font-semibold text-[#C9D2BF]">
        repartido en {balance.methodCount} {balance.methodCount === 1 ? 'medio de pago' : 'medios de pago'}
      </p>
      <div className="relative mt-3 flex">
        {allowance.kind === 'sin-datos' ? (
          isLoading ? (
            <div role="status" aria-label="Calculando tu día" className="h-[46px] w-56 animate-pulse rounded-full bg-[#E3B23C]/60" />
          ) : (
            <button
              type="button"
              onClick={onAddIncome}
              className="flex min-h-[46px] items-center gap-2.5 rounded-full bg-[#E3B23C] px-6 text-[16px] font-extrabold text-[#0B3D2E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F1EEDD]"
            >
              Cargar ingresos
            </button>
          )
        ) : (
          <p className="flex min-h-[46px] items-center gap-2.5 rounded-full bg-[#E3B23C] px-6 text-[16px] font-extrabold leading-tight text-[#0B3D2E]">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
            <span>
              {over ? 'Pasaste tu presupuesto por ' : 'Hoy podés gastar '}
              <AmountDisplay cents={over ? allowance.overCents : allowance.dailyCents} />
              {status && ` · ${DAY_STATUS_LABELS[status]}`}
            </span>
          </p>
        )}
      </div>
    </section>
  )
}

/** Width of a digit in Nunito ExtraBold, with the tight tracking, in em (a little generous so it never overflows). */
const CHAR_EM = 0.64
const MAX_FIGURE_PX = 64
const MIN_FIGURE_PX = 22

/**
 * The big figure: the real total in ONE line. The font size follows the card's width (container query units) and the
 * number of characters, so a long amount shrinks instead of wrapping, and never scrolls sideways.
 */
function Figure({ cents }: { cents: Cents }) {
  const { hidden } = useHiddenAmounts()
  const text = hidden ? MASK : formatArs(cents)
  const size = `clamp(${MIN_FIGURE_PX}px, ${(100 / (text.length * CHAR_EM)).toFixed(2)}cqw, ${MAX_FIGURE_PX}px)`
  return (
    <p
      className="relative whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.04em] tabular-nums"
      style={{ fontSize: size }}
      data-testid="hero-figure"
    >
      <AmountDisplay cents={cents} />
    </p>
  )
}
