import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { formatMonthYear } from '@/shared/lib/dates'
import { shiftMonth, type IsoDate } from '@/shared/lib/month'
import { cn } from './cn'

interface MonthPickerProps {
  /** First day of the selected month. */
  value: IsoDate
  /** First day of the newest selectable month (the current one). */
  latest: IsoDate
  onChange: (month: IsoDate) => void
  monthsBack?: number
  tone?: 'dark' | 'light'
}

/** Dropdown of recent months. Months are ISO "YYYY-MM-01" dates. */
export function MonthPicker({
  value,
  latest,
  onChange,
  monthsBack = 12,
  tone = 'dark',
}: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const months = Array.from({ length: monthsBack }, (_, i) => shiftMonth(latest, -i))

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex min-h-11 items-center gap-2 font-display text-xl font-medium',
          tone === 'dark' ? 'text-text-muted-on-dark' : 'text-forest',
        )}
      >
        {formatMonthYear(value)}
        <ChevronDown aria-hidden="true" className="size-5" strokeWidth={2} />
      </button>
      {open && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul
            id={listId}
            role="listbox"
            aria-label="Mes"
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            className="absolute left-0 top-12 z-20 max-h-72 w-56 overflow-y-auto rounded-lg border border-cream bg-canvas p-1 shadow-lg"
          >
            {months.map((month) => (
              <li key={month} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={month === value}
                  onClick={() => {
                    onChange(month)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center rounded-md px-3 font-display text-base font-medium text-forest',
                    month === value && 'bg-lime',
                  )}
                >
                  {formatMonthYear(month)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
