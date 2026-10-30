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
  /** Which side the summary and day amounts show (screens 015 / 078 / 079). */
  kind?: 'all' | 'expense' | 'income'
  incomeCount?: number
  /** False in the list view: only the month navigation and summary remain. */
  showDays?: boolean
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
  kind = 'all',
  incomeCount = 0,
  showDays = true,
}: ActivityCalendarProps) {
  const { hidden } = useHiddenAmounts()
  const today = todayIso()
  const blanks = days[0] ? weekdayIndex(days[0].date) : 0
  const elapsed = Math.max(1, days.filter((d) => d.date <= today).length)
  const label =
    'font-display text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted-on-dark'
  const value = 'font-display text-[26px] font-extrabold leading-8'

  return (
    <section
      aria-label={showDays ? 'Calendario del mes' : 'Resumen del mes'}
      className="rounded-[28px] bg-forest p-4 text-cream"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Mes anterior"
          className="flex size-11 items-center justify-center rounded-full bg-surface"
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
        <h2 className="font-display text-[21px] font-extrabold">{formatMonthYear(month)}</h2>
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

      <dl className="mt-3 flex justify-between px-1">
        <div>
          <dt className={label}>{kind === 'income' ? 'Ingresaste' : 'Gastaste'}</dt>
          <dd className={cn(value, kind === 'income' ? 'text-lime' : 'text-blush')}>
            <AmountDisplay cents={kind === 'income' ? incomeCents : expenseCents} />
          </dd>
        </div>
        <div className="text-right">
          <dt className={label}>
            {kind === 'all' ? 'Ingresaste' : kind === 'expense' ? 'Por día' : 'Ingresos'}
          </dt>
          <dd className={cn(value, kind === 'all' ? 'text-lime' : 'text-cream')}>
            {kind === 'all' ? (
              <AmountDisplay cents={incomeCents} />
            ) : kind === 'expense' ? (
              <AmountDisplay cents={Math.round(expenseCents / elapsed / 100) * 100} />
            ) : (
              `${incomeCount} este mes`
            )}
          </dd>
        </div>
      </dl>

      {showDays && (
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="text-center font-display text-[15px] font-extrabold text-text-muted-on-dark"
            >
              {d}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const selected = day.date === selectedDay
            const hasExpense = kind !== 'income' && day.expenseCents > 0
            const hasIncome = kind !== 'expense' && day.incomeCents > 0
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
                  'flex h-[52px] min-w-0 flex-col items-center justify-center rounded-[14px] font-display text-[18px] font-extrabold leading-tight',
                  selected
                    ? 'bg-lime text-forest'
                    : future
                      ? 'bg-transparent text-text-muted-on-dark/60'
                      : 'bg-surface text-cream',
                )}
              >
                {dayNumber}
                {(hasExpense || hasIncome) && (
                  <span
                    className={cn(
                      'text-[11px] font-extrabold',
                      selected ? 'text-ink' : 'text-lime',
                    )}
                  >
                    {hidden ? (
                      '•'
                    ) : hasExpense ? (
                      <AmountDisplay cents={day.expenseCents} compact />
                    ) : (
                      <AmountDisplay cents={day.incomeCents} compact />
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
