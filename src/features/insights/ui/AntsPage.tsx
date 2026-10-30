import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { monthNameOf } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { MoniGlyph, Page, Panel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useAnts } from '../api/useAnts'
import {
  antKey,
  buildAntsTip,
  groupDeltas,
  monthChangePercent,
  type AntGroup,
} from '../domain/ants'

type Period = 'current' | 'previous'

// Screen 033 — Gastos hormiga (real data: get_ant_expenses for the month and the one before it).
export function AntsPage() {
  const [period, setPeriod] = useState<Period>('current')
  const thisMonth = monthStart(todayIso())
  const month = period === 'current' ? thisMonth : shiftMonth(thisMonth, -1)
  const current = useAnts(month)
  const previous = useAnts(shiftMonth(month, -1))

  return (
    <Page>
      <PageHeader title="Gastos hormiga" />
      <SegmentedControl
        label="Período"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'current', label: 'Este mes' },
          { value: 'previous', label: 'Mes pasado' },
        ]}
      />

      {current.isLoading ? (
        <div role="status" aria-label="Cargando gastos hormiga" className="flex flex-col gap-4">
          <Skeleton className="h-52 rounded-[28px]" />
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : current.isError || !current.data ? (
        <EmptyState
          mascotUrl={mascotAlert}
          title="No pudimos cargar tus gastos hormiga"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={() => void current.refetch()}>Reintentar</Button>}
        />
      ) : current.data.groups.length === 0 ? (
        <EmptyState
          mascotUrl={mascotHappy}
          title="Sin hormigas por ahora"
          description={`No hay gastos chicos que se repitan 3 veces o más en ${monthNameOf(month)}. Seguí así.`}
        />
      ) : (
        <AntsContent
          month={month}
          data={current.data}
          previousData={previous.data}
          isCurrentMonth={period === 'current'}
        />
      )}
    </Page>
  )
}

function AntsContent({
  month,
  data,
  previousData,
  isCurrentMonth,
}: {
  month: string
  data: NonNullable<ReturnType<typeof useAnts>['data']>
  previousData: ReturnType<typeof useAnts>['data']
  isCurrentMonth: boolean
}) {
  const pct = monthChangePercent(data, previousData)
  const max = Math.max(data.monthTotalCents, previousData?.monthTotalCents ?? 0)
  const deltas = groupDeltas(data.groups, previousData?.groups ?? [])
  const label = isCurrentMonth ? 'Este mes' : 'Mes pasado'
  const previousLabel = monthNameOf(shiftMonth(month, -1))
  const currentLabel = monthNameOf(month)

  return (
    <>
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          {label} · {currentLabel}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <p className="font-display text-[44px] font-extrabold leading-[52px]">
            {formatArs(data.monthTotalCents)}
          </p>
          {pct !== null && (
            <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[15px] font-extrabold text-forest">
              {pct >= 0 ? (
                <ArrowUp aria-hidden="true" className="size-4" />
              ) : (
                <ArrowDown aria-hidden="true" className="size-4" />
              )}
              {pct >= 0 ? '+' : ''}
              {pct}%
            </span>
          )}
        </div>
        {data.shareOfExpenses !== null && (
          <p className="mt-1 text-[15px] text-text-muted-on-dark">
            Es el {data.shareOfExpenses.toLocaleString('es-AR')}% de lo que gastaste en el mes.
          </p>
        )}
        {previousData && (
          <>
            {[
              { label: previousLabel, cents: previousData.monthTotalCents, color: 'bg-[#6e9c8d]' },
              { label: currentLabel, cents: data.monthTotalCents, color: 'bg-blush' },
            ].map((row) => (
              <div key={row.label} className="mt-3 flex items-center gap-3 text-[15px]">
                <span className="w-28 capitalize text-text-muted-on-dark">{row.label}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full">
                  <span
                    className={`block h-full rounded-full ${row.color}`}
                    style={{ width: `${max > 0 ? (row.cents / max) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-20 text-right font-extrabold">{formatArs(row.cents)}</span>
              </div>
            ))}
          </>
        )}
      </section>
      <Panel className="flex items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40 text-ink">
          <MoniGlyph className="size-9" />
        </span>
        <p className="text-[16px] leading-6">
          <strong className="font-extrabold">Sugerido:</strong> {buildAntsTip(data.groups)}
        </p>
      </Panel>
      <div>
        <h2 className="text-[22px] font-extrabold">Dónde se repiten</h2>
        <p className="text-[15px] text-text-muted">
          Gastos de hasta {formatArs(data.thresholdCents)} que aparecen 3 veces o más
        </p>
      </div>
      <Panel className="py-1">
        <ul className="divide-y divide-sand">
          {data.groups.map((group) => (
            <AntRow key={antKey(group)} group={group} delta={deltas.get(antKey(group)) ?? null} />
          ))}
        </ul>
      </Panel>
    </>
  )
}

function AntRow({ group, delta }: { group: AntGroup; delta: number | null }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <CategoryIconCircle iconName={group.icon} color={group.color} className="size-12" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[18px] font-extrabold">{group.label}</span>
        <span className="block text-[15px] text-text-muted">
          {group.count} veces · {formatArs(group.averageCents)} c/u
        </span>
        <span className="block text-[14px] text-text-muted">
          {formatArs(group.yearlyProjectionCents)} al año si sigue igual
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[18px] font-extrabold">{formatArs(group.totalCents)}</span>
        {delta === null ? (
          <span className="rounded-full bg-sand px-2 py-0.5 text-[13px] font-extrabold">Nueva</span>
        ) : delta === 0 ? (
          <span className="rounded-full bg-sand px-2 py-0.5 text-[13px] font-extrabold">Igual</span>
        ) : delta > 0 ? (
          <span className="flex items-center gap-0.5 rounded-full bg-gold/45 px-2 py-0.5 text-[13px] font-extrabold">
            <ArrowUp aria-hidden="true" className="size-3.5" /> {formatArs(delta)}
          </span>
        ) : (
          <span className="flex items-center gap-0.5 rounded-full bg-lime/45 px-2 py-0.5 text-[13px] font-extrabold">
            <ArrowDown aria-hidden="true" className="size-3.5" /> {formatArs(-delta)}
          </span>
        )}
      </span>
    </li>
  )
}
