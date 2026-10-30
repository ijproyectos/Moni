import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatMonthYear } from '@/shared/lib/dates'
import { daysInMonth, monthStart, shiftMonth, type IsoDate } from '@/shared/lib/month'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { cn } from './cn'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface DatePickerSheetProps {
  title?: string
  value: IsoDate
  /** Days before this one can't be picked. */
  min?: IsoDate
  onClose: () => void
  onConfirm: (date: IsoDate) => void
  /** Explains what the chosen date means (e.g. how much to save per month). */
  hint?: (date: IsoDate) => ReactNode
}

// Screens 138 / 140 / 142 — ¿Para cuándo?
export function DatePickerSheet({
  title = '¿Para cuándo?',
  value,
  min,
  onClose,
  onConfirm,
  hint,
}: DatePickerSheetProps) {
  const [selected, setSelected] = useState(value)
  const [month, setMonth] = useState(monthStart(value))
  const total = daysInMonth(month)
  const [y, m] = month.split('-').map(Number) as [number, number]
  // Monday-first offset of the 1st.
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const iso = (day: number) => `${month.slice(0, 8)}${String(day).padStart(2, '0')}`

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="rounded-[24px] border border-sand bg-card p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth((mm) => shiftMonth(mm, -1))}
            className="flex size-10 items-center justify-center rounded-full border border-sand"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <p className="text-[18px] font-extrabold">{formatMonthYear(month)}</p>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMonth((mm) => shiftMonth(mm, 1))}
            className="flex size-10 items-center justify-center rounded-full border border-sand"
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
            const active = date === selected
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                aria-label={date}
                onClick={() => setSelected(date)}
                className={cn(
                  'mx-auto flex size-11 items-center justify-center rounded-full text-[17px] font-extrabold',
                  active ? 'bg-forest text-cream' : 'text-ink',
                  disabled && 'opacity-30',
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
      {hint && <div className="mt-3">{hint(selected)}</div>}
      <Button className="mt-4" onClick={() => onConfirm(selected)}>
        Listo
      </Button>
    </BottomSheet>
  )
}
