import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { monthNameOf } from '@/shared/lib/dates'
import { daysInMonth, monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { getCategoryIcon, themedColor, tint } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Kicker } from '@/shared/ui/Kicker'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { formatArs } from '@/shared/lib/money'
import { useAnts } from '../api/useAnts'
import { useAntWeekdays } from '../api/useAntWeekdays'
import { antKey, monthChangePercent, type AntExpenses, type AntGroup } from '../domain/ants'
import { antInsight } from '../domain/insights'
import { WEEKDAY_INITIALS, antSavings, busiestWeekdays, weekdayHeadline } from '../domain/antsPatterns'

type Period = 'current' | 'previous'

const BAR_AREA = 70

// Gastos hormiga (screen 26). Real data: get_ant_expenses (untouched) plus the month's own movements for the weekdays.
export function AntsPage() {
  const [period, setPeriod] = useState<Period>('current')
  const thisMonth = monthStart(todayIso())
  const month = period === 'current' ? thisMonth : shiftMonth(thisMonth, -1)
  const current = useAnts(month)
  const previous = useAnts(shiftMonth(month, -1))

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader title="Gastos hormiga" subtitle={monthNameOf(month)} />
      <SegmentedControl
        label="Período"
        variant="menta"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'current', label: 'Este mes' },
          { value: 'previous', label: 'Mes pasado' },
        ]}
      />

      {current.isLoading ? (
        <div role="status" aria-label="Cargando gastos hormiga" className="flex flex-col gap-3">
          <Skeleton className="h-36 rounded-[30px]" />
          <Skeleton className="h-28 rounded-[26px]" />
          <Skeleton className="h-48 rounded-[26px]" />
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
    </section>
  )
}

function AntsContent({
  month,
  data,
  previousData,
  isCurrentMonth,
}: {
  month: string
  data: AntExpenses
  previousData: AntExpenses | undefined
  isCurrentMonth: boolean
}) {
  const insight = antInsight(data)
  const pct = monthChangePercent(data, previousData)
  const weekdays = useAntWeekdays(data, month)
  const busiest = weekdays ? busiestWeekdays(weekdays) : []
  const maxCount = Math.max(1, ...(weekdays ?? [0]))
  const observed = isCurrentMonth ? Number(todayIso().slice(8, 10)) : daysInMonth(month)
  const savings = antSavings(data.groups[0], observed)

  return (
    <>
      {insight && (
        <section aria-label="Resumen" className="flex flex-col gap-1.5 rounded-[30px] bg-gold px-[18px] py-4 text-[#3D2E00]">
          <Kicker as="h2" className="font-medium text-[#5A4300]">
            {insight.labels.join(' + ')}, al año
          </Kicker>
          <AmountDisplay cents={insight.yearlyCents} className="text-[44px] font-bold leading-none tracking-[-0.04em]" />
          <p className="text-[13.5px] text-[#5A4300]">
            Son unos <AmountDisplay cents={insight.weeklyCents} /> por semana en {insight.count}{' '}
            {insight.count === 1 ? 'compra chica' : 'compras chicas'}
            {pct !== null && ` · ${pct >= 0 ? '+' : ''}${pct}% vs mes anterior`}
          </p>
        </section>
      )}

      {weekdays && weekdays.some((c) => c > 0) && (
        <section aria-label="Cuándo pasan" className="flex flex-col gap-2.5 rounded-[26px] bg-card px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Cuándo pasan</h2>
            <span className="text-[12px] text-text-muted">{weekdayHeadline(busiest)}</span>
          </div>
          <div
            role="img"
            aria-label={`Compras por día de la semana: ${weekdays
              .map((c, i) => `${WEEKDAY_INITIALS[i]} ${c}`)
              .join(', ')}`}
            className="grid grid-cols-7 items-end gap-2.5"
            style={{ height: BAR_AREA }}
          >
            {weekdays.map((count, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={cn('rounded-full', busiest.includes(i) ? 'bg-[#E8B931]' : 'bg-[#FFF0B8] dark:bg-warn-bg')}
                style={{ height: Math.max(6, Math.round((count / maxCount) * BAR_AREA)) }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 gap-2.5 text-center text-[11.5px] text-text-muted">
            {WEEKDAY_INITIALS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </section>
      )}

      <ul aria-label="Dónde se repiten" className="divide-y divide-line rounded-[26px] bg-card px-4 py-0.5">
        {data.groups.map((group) => (
          <AntRow key={antKey(group)} group={group} />
        ))}
      </ul>
      <p className="px-1 text-[12px] text-text-muted">
        Gastos de hasta {formatArs(data.thresholdCents)} que aparecen 3 veces o más.
      </p>

      {savings && (
        <section aria-label="Consejo" className="flex items-center gap-3 rounded-3xl bg-lilac-soft px-3.5 py-3">
          <img src={mascotHappy} alt="" className="size-8 shrink-0 rounded-full" />
          <p className="flex-1 text-[13.5px] text-lilac-ink dark:text-ink">
            Si bajás {savings.label} de {savings.fromPerWeek} a {savings.toPerWeek} veces por semana, ahorrás{' '}
            <strong className="font-bold">
              <AmountDisplay cents={savings.yearlyCents} />
            </strong>{' '}
            al año.
          </p>
        </section>
      )}
    </>
  )
}

function AntRow({ group }: { group: AntGroup }) {
  const Icon = getCategoryIcon(group.icon)
  return (
    <li className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-[9px]">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: tint(group.color), color: themedColor(group.color) }}
      >
        <Icon className="size-[18px]" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold">{group.label}</div>
        <div className="text-[12px] text-text-muted">
          {group.count} {group.count === 1 ? 'vez' : 'veces'} este mes
        </div>
      </div>
      <AmountDisplay cents={group.totalCents} className="whitespace-nowrap text-[15px] font-semibold" />
    </li>
  )
}
