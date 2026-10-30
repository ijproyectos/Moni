import { CalendarDays } from 'lucide-react'
import mascotUrl from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { formatDayMonth } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { DatePickerSheet } from '@/shared/ui/DatePickerSheet'
import { MoniCalcCard, SectionLabel } from '@/shared/ui/kit'
import { daysBetween } from '../domain/dates'

export const tripFieldClass =
  'h-14 rounded-[18px] border border-sand bg-card px-4 text-[17px] placeholder:text-text-muted'

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
            className="flex min-h-14 items-center gap-2 rounded-[18px] border border-sand bg-card px-4 text-[17px] font-extrabold"
          >
            <CalendarDays aria-hidden="true" className="size-5 shrink-0" />{' '}
            {formatDayMonth(k === 'from' ? startsOn : endsOn).replace(' ', ' de ')}
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

/** The date picker that opens from the departure / return buttons (the return can never be before the departure). */
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
  return (
    <DatePickerSheet
      title={picking === 'from' ? '¿Cuándo salís?' : '¿Cuándo volvés?'}
      value={picking === 'from' ? startsOn : endsOn}
      min={picking === 'from' ? min : startsOn}
      onClose={onClose}
      onConfirm={(d) =>
        onChange(
          picking === 'from'
            ? { startsOn: d, endsOn: endsOn < d ? d : endsOn }
            : { startsOn, endsOn: d },
        )
      }
    />
  )
}
