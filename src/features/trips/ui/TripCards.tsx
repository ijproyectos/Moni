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
          ? 'block rounded-[28px] border border-line bg-card p-5'
          : 'block rounded-[28px] bg-forest p-5 text-cream'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            ended
              ? 'rounded-full bg-tint-green px-3 py-1 text-[15px] font-bold'
              : 'rounded-full bg-white/15 px-3 py-1 text-[15px] font-bold text-cream'
          }
        >
          Personal
        </span>
        <span className={`text-[15px] font-extrabold ${muted}`}>
          {tripTimeLabel(trip, summary, today)}
        </span>
      </div>
      <div className="mt-3">
        <span className="min-w-0 flex-1">
          <span className="block break-words font-display text-[26px] font-extrabold leading-8">
            {trip.name}
          </span>
          <span className={`block text-[15px] ${muted}`}>
            {rangeLabel(trip.startsOn, trip.endsOn)} · {summary.totalDays}{' '}
            {summary.totalDays === 1 ? 'día' : 'días'}
          </span>
        </span>
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
        <p className={`mt-2 text-[14px] font-extrabold ${ended ? 'text-expense' : 'text-expense-on-dark'}`}>
          Te pasaste {formatArs(-summary.remainingCents)} del presupuesto
        </p>
      )}
    </Link>
  )
}
