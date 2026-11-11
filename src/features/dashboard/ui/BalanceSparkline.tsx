import { useId } from 'react'
import { formatArs } from '@/shared/lib/money'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import type { BalancePoint } from '../domain/balanceSeries'

const WIDTH = 300
const HEIGHT = 96
const PAD = 8

function pathOf(points: readonly BalancePoint[]): { line: string; area: string } {
  const values = points.map((p) => p.cents)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const x = (i: number) => (i / Math.max(points.length - 1, 1)) * WIDTH
  // A flat balance sits in the middle of the band instead of dividing by zero.
  const y = (v: number) =>
    span === 0 ? HEIGHT / 2 : PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2)
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')
  return { line, area: `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z` }
}

/**
 * Line of the available money over the last days, drawn from the real daily balance. With too little history it says so
 * instead of drawing a made-up curve.
 */
export function BalanceSparkline({ series }: { series: readonly BalancePoint[] | null }) {
  const gradientId = useId()
  const { hidden } = useHiddenAmounts()

  if (!series) {
    return (
      <p className="mx-1 my-4 rounded-[18px] bg-sand/60 px-4 py-3 text-[14px] leading-5 text-text-muted">
        Todavía no hay movimientos suficientes para mostrar cómo evoluciona tu dinero.
      </p>
    )
  }

  const first = series[0]
  const last = series[series.length - 1]
  const { line, area } = pathOf(series)
  const label =
    hidden || !first || !last
      ? 'Evolución de tu dinero disponible en los últimos días'
      : `Evolución de tu dinero disponible en los últimos ${series.length} días: de ${formatArs(first.cents)} a ${formatArs(last.cents)}`

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="my-3 block h-[96px] w-full text-cream"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
