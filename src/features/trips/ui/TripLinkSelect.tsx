import { rangeLabel } from '../domain/dates'
import { useTrips } from '../api/useTrips'

/**
 * "Viaje" field of the edit sheet of an expense: pick one of the person's OWN trips (or none). It only lists the
 * trips the person owns (the server also enforces it), keeps showing the one the expense already belongs to, and
 * renders nothing when there is nothing to choose from.
 */
export function TripLinkSelect({
  value,
  onChange,
}: {
  /** Selected trip id, '' for none. */
  value: string
  onChange: (tripId: string) => void
}) {
  const trips = useTrips()
  const options = (trips.data ?? [])
    .filter((t) => !t.archivedAt || t.id === value)
    .sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))
  if (options.length === 0) return null
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
        Viaje
      </span>
      <select
        aria-label="Viaje"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest"
      >
        <option value="">Sin viaje</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {rangeLabel(t.startsOn, t.endsOn)}
          </option>
        ))}
      </select>
    </label>
  )
}
