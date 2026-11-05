import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { cn } from '@/shared/ui/cn'
import { Skeleton } from '@/shared/ui/Skeleton'
import type { BarDatum } from '../domain/bars'
import { daysInactiveChip, formatCount, type InactivityTone } from '../domain/format'

export function PanelCard({
  title,
  children,
  className,
  aside,
}: {
  title?: string
  children: ReactNode
  className?: string
  aside?: ReactNode
}) {
  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </Card>
  )
}

export function Kpi({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'warn'
}) {
  return (
    <Card className={cn('flex flex-col gap-1', tone === 'warn' && 'border-lacquer')}>
      <p className="text-[13px] font-bold text-text-muted">{label}</p>
      <p className="font-display text-[28px] font-extrabold leading-8 text-ink">{value}</p>
      {hint && <p className="text-[13px] text-text-muted">{hint}</p>}
    </Card>
  )
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{children}</div>
}

export function SinDatos({ note }: { note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-xl font-extrabold text-text-muted">sin datos</p>
      {note && <p className="text-[13px] text-text-muted">{note}</p>}
    </div>
  )
}

const CHIP_TONES: Record<InactivityTone | 'neutral' | 'bad', string> = {
  active: 'bg-lime text-forest',
  recent: 'bg-sand text-ink',
  idle: 'bg-gold text-forest',
  inactive: 'bg-blush text-forest',
  neutral: 'bg-sand text-ink',
  bad: 'bg-lacquer text-white',
}

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: InactivityTone | 'neutral' | 'bad'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-bold',
        CHIP_TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

/** Semantic chip for "days without activity": <=1 active, 2-7, 8-30, >30 inactive. */
export function DaysInactiveChip({ days }: { days: number }) {
  const chip = daysInactiveChip(days)
  return (
    <Chip tone={chip.tone}>
      {chip.label} · {days} d
    </Chip>
  )
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export const TH = 'whitespace-nowrap px-3 py-2 text-left text-[13px] font-bold text-text-muted'
export const TD = 'whitespace-nowrap px-3 py-2 text-[15px]'
export const TABLE = 'w-full min-w-[560px] border-collapse'
export const TR = 'border-t border-line'

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-[14px] text-text-muted">{label}</dt>
      <dd className="text-right text-[15px] font-semibold">{children}</dd>
    </div>
  )
}

export function LoadingBlock() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </div>
  )
}

export function ErrorBlock({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-3 border-lacquer">
      <p className="font-display text-lg font-extrabold">
        {message ?? 'No pudimos cargar esta sección.'}
      </p>
      <Button variant="dark" className="h-11 w-auto px-6 text-base" onClick={onRetry}>
        Reintentar
      </Button>
    </Card>
  )
}

/** Plain SVG bars (no chart library). `format` renders the value in the accessible label and the tooltips. */
export function BarChart({
  data,
  format = formatCount,
  title,
}: {
  data: readonly BarDatum[]
  format?: (value: number) => string
  title: string
}) {
  const width = 600
  const height = 120
  const max = Math.max(1, ...data.map((d) => d.value))
  const gap = 3
  const barWidth = data.length > 0 ? (width - gap * (data.length - 1)) / data.length : 0
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const first = data[0]
  const last = data[data.length - 1]
  return (
    <figure className="flex flex-col gap-1">
      <svg
        role="img"
        aria-label={`${title}. Total del período: ${format(total)}`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full"
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const barHeight = d.value === 0 ? 1 : Math.max(2, (d.value / max) * (height - 4))
          return (
            <rect
              key={`${d.label}-${i}`}
              x={i * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={2}
              className={d.value === 0 ? 'fill-track' : 'fill-forest dark:fill-lime'}
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          )
        })}
      </svg>
      {first && last && (
        <figcaption className="flex justify-between text-[12px] text-text-muted">
          <span>{first.label}</span>
          <span>máx. {format(max)}</span>
          <span>{last.label}</span>
        </figcaption>
      )}
    </figure>
  )
}

export function HBar({
  label,
  value,
  max,
  format = formatCount,
}: {
  label: string
  value: number
  max: number
  format?: (value: number) => string
}) {
  const pct = max <= 0 ? 0 : Math.max(2, (value / max) * 100)
  return (
    <div className="flex items-center gap-3 text-[14px]">
      <span className="w-40 shrink-0 truncate font-semibold" title={label}>
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-forest dark:bg-lime" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right font-bold">{format(value)}</span>
    </div>
  )
}
