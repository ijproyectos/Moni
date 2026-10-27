import { ArrowDown, ArrowUp, Coffee, Droplet, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { formatArs } from '@/shared/lib/money'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { IconTile, MoniGlyph, Page, Panel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ANTS_MONTH, ANTS_WEEK, type AntItem } from '../mock/antsData'

const ICONS = {
  coffee: { icon: Coffee, bg: '#fdeab8', color: '#8a5a00' },
  kiosk: { icon: ShoppingBag, bg: '#fbdcd7', color: '#b8321f' },
  water: { icon: Droplet, bg: '#d9ebe4', color: '#064735' },
}

// Screen 033 — Gastos hormiga.
export function AntsPage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const data = period === 'week' ? ANTS_WEEK : ANTS_MONTH
  const pct = Math.round(((data.totalCents - data.previousCents) / data.previousCents) * 100)
  const max = Math.max(data.totalCents, data.previousCents)

  return (
    <Page>
      <PageHeader title="Gastos hormiga" />
      <SegmentedControl
        label="Período"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'Esta semana' },
          { value: 'month', label: 'Este mes' },
        ]}
      />
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          {data.label} · {data.rangeLabel}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <p className="font-display text-[44px] font-extrabold leading-[52px]">
            {formatArs(data.totalCents)}
          </p>
          <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[15px] font-extrabold text-forest">
            {pct >= 0 ? (
              <ArrowUp aria-hidden="true" className="size-4" />
            ) : (
              <ArrowDown aria-hidden="true" className="size-4" />
            )}
            {pct >= 0 ? '+' : ''}
            {pct}%
          </span>
        </div>
        {[
          { label: data.previousLabel, cents: data.previousCents, color: 'bg-[#6e9c8d]' },
          { label: data.currentLabel, cents: data.totalCents, color: 'bg-blush' },
        ].map((row) => (
          <div key={row.label} className="mt-3 flex items-center gap-3 text-[15px]">
            <span className="w-28 text-text-muted-on-dark">{row.label}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full">
              <span
                className={`block h-full rounded-full ${row.color}`}
                style={{ width: `${(row.cents / max) * 100}%` }}
              />
            </span>
            <span className="w-20 text-right font-extrabold">{formatArs(row.cents)}</span>
          </div>
        ))}
      </section>
      <Panel className="flex items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40 text-forest">
          <MoniGlyph className="size-9" />
        </span>
        <p className="text-[16px] leading-6">
          <strong className="font-extrabold">Moni dice:</strong> {data.tip}
        </p>
      </Panel>
      <div>
        <h2 className="text-[22px] font-extrabold">Dónde se repiten</h2>
        <p className="text-[15px] text-text-muted">
          Gastos de hasta $5.000 que aparecen 3 veces o más
        </p>
      </div>
      <Panel className="py-1">
        <ul className="divide-y divide-sand">
          {data.items.map((item) => (
            <AntRow key={item.name} item={item} />
          ))}
        </ul>
      </Panel>
    </Page>
  )
}

function AntRow({ item }: { item: AntItem }) {
  const visual = ICONS[item.icon]
  return (
    <li className="flex items-center gap-3 py-3">
      <IconTile icon={visual.icon} bg={visual.bg} color={visual.color} />
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-extrabold">{item.name}</span>
        <span className="block text-[15px] text-text-muted">
          {item.count} veces · {formatArs(item.unitCents)} c/u
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[18px] font-extrabold">{formatArs(item.totalCents)}</span>
        {item.deltaCents === 0 ? (
          <span className="rounded-full bg-sand px-2 py-0.5 text-[13px] font-extrabold">Igual</span>
        ) : item.deltaCents > 0 ? (
          <span className="flex items-center gap-0.5 rounded-full bg-gold/45 px-2 py-0.5 text-[13px] font-extrabold">
            <ArrowUp aria-hidden="true" className="size-3.5" /> {formatArs(item.deltaCents)}
          </span>
        ) : (
          <span className="flex items-center gap-0.5 rounded-full bg-lime/45 px-2 py-0.5 text-[13px] font-extrabold">
            <ArrowDown aria-hidden="true" className="size-3.5" /> {formatArs(-item.deltaCents)}
          </span>
        )}
      </span>
    </li>
  )
}
