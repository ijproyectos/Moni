import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthYear } from '@/shared/lib/dates'
import type { Cents } from '@/shared/lib/money'
import { todayIso, weekdayIndex, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import type { CalendarDayTotal } from '../domain/transactionQueries'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface ActivityCalendarProps {
  month: IsoDate
  days: readonly CalendarDayTotal[]
  expenseCents: Cents
  incomeCents: Cents
  selectedDay: IsoDate | null
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
  onSelectDay: (day: IsoDate | null) => void
}

export function ActivityCalendar({
  month,
  days,
  expenseCents,
  incomeCents,
  selectedDay,
  canGoNext,
  onPrev,
  onNext,
  onSelectDay,
}: ActivityCalendarProps) {
  const { hidden } = useHiddenAmounts()
  const today = todayIso()
  const blanks = days[0] ? weekdayIndex(days[0].date) : 0

  return (
    <section aria-label="Calendario del mes" className="rounded-xl bg-forest p-4 text-cream">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Mes anterior"
          className="flex size-11 items-center justify-center rounded-full bg-surface"
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
        <h2 className="font-display text-xl font-semibold">{formatMonthYear(month)}</h2>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Mes siguiente"
          className="flex size-11 items-center justify-center rounded-full bg-surface disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
      </div>

      <dl className="mt-3 flex gap-10 px-1">
        <div>
          <dt className="font-display text-xs font-semibold uppercase tracking-wider text-text-muted-on-dark">
            Gastaste
          </dt>
          <dd className="font-display text-2xl font-semibold text-blush">
            <AmountDisplay cents={expenseCents} />
          </dd>
        </div>
        <div>
          <dt className="font-display text-xs font-semibold uppercase tracking-wider text-text-muted-on-dark">
            Ingresaste
          </dt>
          <dd className="font-display text-2xl font-semibold text-lime">
            <AmountDisplay cents={incomeCents} />
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="text-center font-display text-sm font-semibold text-text-muted-on-dark"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const selected = day.date === selectedDay
          const hasExpense = day.expenseCents > 0
          const hasIncome = day.incomeCents > 0
          const dayNumber = Number(day.date.slice(8, 10))
          const future = day.date > today
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={selected}
              aria-label={`Día ${dayNumber}`}
              onClick={() => onSelectDay(selected ? null : day.date)}
              className={cn(
                'flex h-14 min-w-0 flex-col items-center justify-center rounded-md font-display text-[17px] font-semibold leading-tight',
                selected ? 'bg-lime text-forest' : 'bg-surface text-cream',
                future && !selected && !hasExpense && !hasIncome && 'text-text-muted-on-dark',
                day.date === today && !selected && 'ring-2 ring-lime',
              )}
            >
              {dayNumber}
              {(hasExpense || hasIncome) && (
                <span
                  className={cn(
                    'text-[11px] font-semibold',
                    selected ? 'text-forest' : 'text-lime',
                  )}
                >
                  {hidden ? (
                    '•'
                  ) : hasExpense ? (
                    <AmountDisplay cents={day.expenseCents} compact />
                  ) : (
                    <>
                      +<AmountDisplay cents={day.incomeCents} compact />
                    </>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
