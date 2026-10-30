import { ChevronRight, Send } from 'lucide-react'
import { Link } from 'react-router'
import { formatArs } from '@/shared/lib/money'
import { ProgressBar } from '@/shared/ui/kit'
import { rangeLabel } from '../domain/dates'
import { tripTimeLabel, type PersonalTrip, type TripSummary } from '../domain/trip'

/** A personal trip in the list: destination, dates and how much of the budget is spent (real movements). */
export function PersonalTripCard({
  trip,
  summary,
  today,
}: {
  trip: PersonalTrip
  summary: TripSummary
  today: string
}) {
  const ended = summary.status === 'ended' || Boolean(trip.archivedAt)
  const muted = ended ? 'text-text-muted' : 'text-text-muted-on-dark'
  return (
    <Link
      to={`/viajes/${trip.id}`}
      className={
        ended
          ? 'block rounded-[28px] border border-sand bg-white p-5'
          : 'block rounded-[28px] bg-forest p-5 text-cream'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            ended
              ? 'rounded-full bg-sand px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em]'
              : 'rounded-full bg-surface px-3 py-1 text-[13px] font-extrabold uppercase tracking-[0.1em] text-lime'
          }
        >
          Personal
        </span>
        <span className={`text-[15px] font-extrabold ${muted}`}>
          {tripTimeLabel(trip, summary, today)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span
          className={
            ended
              ? 'flex size-14 shrink-0 items-center justify-center rounded-full bg-lime/40'
              : 'flex size-14 shrink-0 items-center justify-center rounded-full bg-lime text-forest'
          }
        >
          <Send aria-hidden="true" className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-display text-[26px] font-extrabold leading-8">
            {trip.name}
          </span>
          <span className={`block text-[15px] ${muted}`}>
            {rangeLabel(trip.startsOn, trip.endsOn)} · {summary.totalDays}{' '}
            {summary.totalDays === 1 ? 'día' : 'días'}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
      </div>
      <div
        className={`mt-4 flex flex-wrap justify-between gap-x-3 text-[15px] font-extrabold ${muted}`}
      >
        <span>Gastaste {formatArs(summary.spentCents)}</span>
        <span>Presupuesto {formatArs(trip.budgetCents)}</span>
      </div>
      <ProgressBar
        value={summary.progress}
        tone={ended ? 'light' : 'dark'}
        className="mt-2"
        label={`Gastado del presupuesto de ${trip.name}`}
      />
      {summary.overBudget && (
        <p className={`mt-2 text-[14px] font-extrabold ${ended ? 'text-expense' : 'text-blush'}`}>
          Te pasaste {formatArs(-summary.remainingCents)} del presupuesto
        </p>
      )}
    </Link>
  )
}
