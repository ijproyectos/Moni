import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthYear } from '@/shared/lib/dates'
import { todayIso, weekdayIndex, type IsoDate } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import type { CalendarDayTotal } from '../domain/transactionQueries'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
/** Days the collapsed strip shows: the latest ones of the month. */
const STRIP_DAYS = 6

type Kind = 'all' | 'expense' | 'income'

interface DayCellProps {
  day: CalendarDayTotal
  kind: Kind
  selected: boolean
  today: IsoDate
  onSelect: () => void
  variant: 'strip' | 'grid'
}

/** One day: its number and, when there is activity, the compact amount of the side being shown. */
function DayCell({ day, kind, selected, today, onSelect, variant }: DayCellProps) {
  const { hidden } = useHiddenAmounts()
  const hasExpense = kind !== 'income' && day.expenseCents > 0
  const hasIncome = kind !== 'expense' && day.incomeCents > 0
  const dayNumber = Number(day.date.slice(8, 10))
  const future = day.date > today
  const isToday = day.date === today
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Día ${dayNumber}`}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col items-center justify-center rounded-[16px] font-display font-extrabold leading-tight',
        variant === 'strip' ? 'min-h-[76px] flex-1 gap-0.5 border-2' : 'h-[52px] text-[18px]',
        variant === 'strip' &&
          (selected
            ? 'border-forest dark:border-lime'
            : isToday
              ? 'border-line'
              : 'border-transparent'),
        variant === 'grid' &&
          (selected
            ? 'bg-forest text-cream dark:bg-lime dark:text-forest'
            : isToday
              ? 'border-2 border-forest dark:border-lime'
              : ''),
        future && !selected && 'text-text-muted/60',
      )}
    >
      {variant === 'strip' && (
        <span aria-hidden="true" className="text-[14px] text-text-muted">
          {WEEKDAYS[weekdayIndex(day.date)]}
        </span>
      )}
      <span className={variant === 'strip' ? 'text-[24px]' : undefined}>{dayNumber}</span>
      {(hasExpense || hasIncome) && (
        <span
          className={cn(
            'text-[11px] font-extrabold',
            variant === 'grid' && selected
              ? 'text-cream dark:text-forest'
              : hasExpense
                ? 'text-expense'
                : 'text-income',
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
}

interface ActivityWeekStripProps {
  days: readonly CalendarDayTotal[]
  selectedDay: IsoDate | null
  kind?: Kind
  onSelectDay: (day: IsoDate | null) => void
}

/** The latest days of the month in one row (the calendar, collapsed). Tapping a day filters the list to it. */
export function ActivityWeekStrip({
  days,
  selectedDay,
  kind = 'all',
  onSelectDay,
}: ActivityWeekStripProps) {
  const today = todayIso()
  const upToToday = days.filter((d) => d.date <= today)
  // A month still to come has nothing to show yet: fall back to its first days.
  const shown = (upToToday.length > 0 ? upToToday : days).slice(-STRIP_DAYS)
  return (
    <div role="group" aria-label="Últimos días del mes" className="flex gap-1">
      {shown.map((day) => (
        <DayCell
          key={day.date}
          day={day}
          kind={kind}
          today={today}
          variant="strip"
          selected={day.date === selectedDay}
          onSelect={() => onSelectDay(day.date === selectedDay ? null : day.date)}
        />
      ))}
    </div>
  )
}

interface ActivityCalendarProps {
  month: IsoDate
  days: readonly CalendarDayTotal[]
  selectedDay: IsoDate | null
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
  onSelectDay: (day: IsoDate | null) => void
  /** Which side the day amounts show. */
  kind?: Kind
}

/** The whole month as a grid, with the month navigation. */
export function ActivityCalendar({
  month,
  days,
  selectedDay,
  canGoNext,
  onPrev,
  onNext,
  onSelectDay,
  kind = 'all',
}: ActivityCalendarProps) {
  const today = todayIso()
  const blanks = days[0] ? weekdayIndex(days[0].date) : 0
  return (
    <section aria-label="Calendario del mes">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Mes anterior"
          className="flex size-11 items-center justify-center rounded-full border border-line"
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
        <h2 className="font-display text-[20px] font-extrabold">{formatMonthYear(month)}</h2>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Mes siguiente"
          className="flex size-11 items-center justify-center rounded-full border border-line disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="text-center font-display text-[15px] font-extrabold text-text-muted"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => (
          <DayCell
            key={day.date}
            day={day}
            kind={kind}
            today={today}
            variant="grid"
            selected={day.date === selectedDay}
            onSelect={() => onSelectDay(day.date === selectedDay ? null : day.date)}
          />
        ))}
      </div>
    </section>
  )
}
