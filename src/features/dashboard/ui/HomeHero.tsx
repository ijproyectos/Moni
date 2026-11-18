import { Eye, EyeOff } from 'lucide-react'
import { distributionLabel, type HomeBalance } from '../domain/homeBalance'
import { formatArs, type Cents } from '@/shared/lib/money'
import { AmountDisplay, MASK } from '@/shared/ui/AmountDisplay'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'

/**
 * "Lo que tenés": the real total of the payment methods in one line, the eye that hides it, and the bar that shows how
 * the money is split (the strong part is the payment method that holds most of it).
 */
export function HomeHero({ balance }: { balance: HomeBalance }) {
  const { hidden, toggle } = useHiddenAmounts()
  const Eye_ = hidden ? EyeOff : Eye
  const percent = balance.top?.percent ?? 0
  return (
    <section aria-labelledby="hero-title" className="relative mx-[18px] pt-3">
      {/* The card behind, peeking out. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 top-0 h-16 -rotate-1 rounded-[26px] bg-[#E2DFC9] dark:bg-[#17291F]"
      />
      <div className="relative flex flex-col gap-2 overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#1B3A2E_0%,#0F2A20_70%)] px-5 pb-5 pt-4 text-[#F1EEDD] shadow-[0_18px_40px_rgba(17,34,24,0.22)] [container-type:inline-size] dark:bg-[linear-gradient(135deg,#2B4A3C_0%,#16291F_75%)]">
        <div className="flex items-start justify-between gap-2">
          <h2 id="hero-title" className="pt-1 text-[14px] font-bold text-[#D4DCCB]">
            Lo que tenés
          </h2>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={hidden}
            aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
            className="-mr-1 -mt-1 flex size-11 items-center justify-center rounded-full bg-white/10 text-[#F1EEDD] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F1EEDD]"
          >
            <Eye_ aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </button>
        </div>
        <Figure cents={balance.totalCents} />
        <div
          role="img"
          aria-label={balance.top ? `${balance.top.percent}% del dinero en ${balance.top.name}` : 'Sin dinero repartido'}
          className="mt-1 flex items-center gap-1.5"
        >
          <span className="h-[5px] min-w-1 rounded-full bg-[#A99BE3]" style={{ width: `${Math.max(percent, 4)}%` }} />
          <span className="size-[5px] shrink-0 rounded-full bg-[#F1EEDD]/80" />
          <span className="h-[5px] flex-1 rounded-full bg-white/10" hidden={percent >= 100} />
        </div>
        <p className="text-[14px] font-semibold text-[#D4DCCB]">{distributionLabel(balance)}</p>
      </div>
    </section>
  )
}

/** Width of a digit in Nunito ExtraBold, with the tight tracking, in em (a little generous so it never overflows). */
const CHAR_EM = 0.64
const MAX_FIGURE_PX = 56
const MIN_FIGURE_PX = 22

/**
 * The big figure in ONE line: the font size follows the card's width (container query units) and the number of
 * characters, so a long amount shrinks instead of wrapping, and never scrolls sideways.
 */
function Figure({ cents }: { cents: Cents }) {
  const { hidden } = useHiddenAmounts()
  const text = hidden ? MASK : formatArs(cents)
  const size = `clamp(${MIN_FIGURE_PX}px, ${(100 / (text.length * CHAR_EM)).toFixed(2)}cqw, ${MAX_FIGURE_PX}px)`
  return (
    <p
      className="whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.04em] tabular-nums"
      style={{ fontSize: size }}
      data-testid="hero-figure"
    >
      <AmountDisplay cents={cents} />
    </p>
  )
}
