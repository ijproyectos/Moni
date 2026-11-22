import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { formatDayMonth, formatMonthYear } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { daysInMonth, monthStart, shiftMonth, type IsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { MoniCalcCard, SectionLabel } from '@/shared/ui/kit'
import { daysBetween } from '../domain/dates'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export const tripFieldClass =
  'h-14 rounded-[18px] border border-line bg-card px-4 text-[17px] placeholder:text-text-muted'

/** Departure / return buttons, the budget field and what that makes per day. Shared by every trip form. */
export function TripDatesBudget({
  startsOn,
  endsOn,
  budgetText,
  budgetLabel,
  budgetCents,
  onPick,
  onBudgetChange,
}: {
  startsOn: IsoDate
  endsOn: IsoDate
  budgetText: string
  budgetLabel: string
  /** Parsed budget, 0 while it is empty or invalid. */
  budgetCents: number
  onPick: (which: 'from' | 'to') => void
  onBudgetChange: (text: string) => void
}) {
  const days = Math.max(1, daysBetween(startsOn, endsOn))
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {(['from', 'to'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            aria-label={k === 'from' ? 'Fecha de ida' : 'Fecha de vuelta'}
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-line bg-card px-4 text-[17px] font-extrabold"
          >
            <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
            <span className="min-w-0 text-left">
              <span className="block text-[12px] font-bold uppercase tracking-[0.1em] text-text-muted">
                {k === 'from' ? 'Ida' : 'Vuelta'}
              </span>
              <span className="block whitespace-nowrap">
                {formatDayMonth(k === 'from' ? startsOn : endsOn).replace(' ', ' de ')}
              </span>
            </span>
          </button>
        ))}
      </div>
      <SectionLabel>{budgetLabel}</SectionLabel>
      <AmountInput
        aria-label="Presupuesto"
        value={budgetText}
        onChange={(e) => onBudgetChange(e.target.value)}
      />
      {budgetCents > 0 && (
        <MoniCalcCard
          mascot={mascotUrl}
          title={`Unos ${formatArs(Math.round(budgetCents / days / 100) * 100)} por día`}
        >
          {days} {days === 1 ? 'día' : 'días'} de viaje.
        </MoniCalcCard>
      )}
    </>
  )
}

/**
 * The trip's date range in one calendar: first the departure, which moves on to the return by itself; picking the return closes
 * the calendar. The range is shaded between both days. Opening it from the return button starts at the return.
 */
export function TripDatePicker({
  picking,
  startsOn,
  endsOn,
  min,
  onClose,
  onChange,
}: {
  picking: 'from' | 'to'
  startsOn: IsoDate
  endsOn: IsoDate
  /** Earliest departure that can be chosen (today for a new trip; none when editing one that already started). */
  min?: IsoDate
  onClose: () => void
  onChange: (next: { startsOn: IsoDate; endsOn: IsoDate }) => void
}) {
  const [phase, setPhase] = useState<'from' | 'to'>(picking)
  const [from, setFrom] = useState(startsOn)
  const [to, setTo] = useState<IsoDate | null>(endsOn)
  const [month, setMonth] = useState(monthStart(picking === 'from' ? startsOn : endsOn))
  const total = daysInMonth(month)
  const [y, m] = month.split('-').map(Number) as [number, number]
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const iso = (day: number) => `${month.slice(0, 8)}${String(day).padStart(2, '0')}`

  function pick(date: IsoDate) {
    if (phase === 'from' || date < from) {
      // The departure (or a day before it while choosing the return: the person is starting over).
      setFrom(date)
      setTo(null)
      setPhase('to')
      return
    }
    onChange({ startsOn: from, endsOn: date })
  }

  return (
    <BottomSheet title={phase === 'from' ? '¿Cuándo salís?' : '¿Cuándo volvés?'} onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-2" aria-live="polite">
        {(['from', 'to'] as const).map((k) => {
          const date = k === 'from' ? from : to
          const active = phase === k
          return (
            <div
              key={k}
              className={cn(
                'rounded-[16px] border-2 px-3 py-2',
                active ? 'border-forest bg-tint-green' : 'border-line bg-card',
              )}
            >
              <span className="block text-[12px] font-bold uppercase tracking-[0.1em] text-text-muted">
                {k === 'from' ? 'Ida' : 'Vuelta'}
              </span>
              <span className="block text-[16px] font-extrabold">
                {date ? formatDayMonth(date).replace(' ', ' de ') : 'Elegí el día'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="rounded-[24px] border border-line bg-card p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth((mm) => shiftMonth(mm, -1))}
            className="flex size-10 items-center justify-center rounded-full border border-line"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <p className="text-[18px] font-extrabold">{formatMonthYear(month)}</p>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMonth((mm) => shiftMonth(mm, 1))}
            className="flex size-10 items-center justify-center rounded-full border border-line"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 text-center">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1 text-[13px] font-bold text-text-muted">
              {d}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {Array.from({ length: total }, (_, i) => {
            const day = i + 1
            const date = iso(day)
            const disabled = Boolean(min && date < min)
            const edge = date === from || date === to
            const range = to !== null && to > from
            const inside = range && date > from && date < to
            const startCap = range && date === from
            const endCap = range && date === to
            return (
              <div key={day} className="relative flex justify-center">
                {(inside || startCap || endCap) && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-y-0.5 bg-tint-green',
                      inside ? 'inset-x-0' : startCap ? 'left-1/2 right-0' : 'left-0 right-1/2',
                    )}
                  />
                )}
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={edge}
                  aria-label={`${date}${date === from ? ', ida' : date === to ? ', vuelta' : ''}`}
                  onClick={() => pick(date)}
                  className={cn(
                    'relative flex size-11 items-center justify-center rounded-full text-[17px] font-extrabold',
                    edge ? 'bg-forest text-cream' : 'text-ink',
                    date === from && date === to && 'ring-2 ring-lime ring-offset-2 ring-offset-card',
                    disabled && 'opacity-30',
                  )}
                >
                  {day}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
