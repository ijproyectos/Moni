import { toCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { daysBetween } from './dates'
import type { TripCurrency } from './trip'

export type BookingKind = 'transport' | 'lodging' | 'other'

export interface TripBooking {
  id: string
  ownerId: string
  /** Personal trip it belongs to, or the group of a shared trip (exactly one of them). */
  tripId: string | null
  groupId: string | null
  /** In a shared trip: only for its owner, or for every member (they see cost, paid and pending, never who funds what). */
  scope: 'personal' | 'shared'
  kind: BookingKind
  subtype: string | null
  /** Hotel, Airbnb, airline… or the name of the booking. */
  title: string
  origin: string | null
  destination: string | null
  address: string | null
  /** Outbound / check-in. */
  startsOn: IsoDate | null
  /** Return / check-out. */
  endsOn: IsoDate | null
  totalCents: Cents
  currency: TripCurrency
  payDeadline: IsoDate | null
  notes: string | null
  status: 'active' | 'cancelled'
  /** Members who share a shared booking (empty for a personal one). */
  participants: string[]
}

export const TRANSPORT_TYPES = [
  { key: 'avion', label: 'Avión' },
  { key: 'micro', label: 'Micro' },
  { key: 'tren', label: 'Tren' },
  { key: 'otro', label: 'Otro' },
] as const

export const LODGING_TYPES = [
  { key: 'hotel', label: 'Hotel' },
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'otro', label: 'Otro' },
] as const

export const OTHER_BOOKING_TYPES = [
  { key: 'auto', label: 'Alquiler de auto' },
  { key: 'excursion', label: 'Excursión' },
  { key: 'seguro', label: 'Seguro' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'otro', label: 'Otra reserva' },
] as const

export const BOOKING_KIND_LABELS: Record<BookingKind, string> = {
  transport: 'Pasaje',
  lodging: 'Alojamiento',
  other: 'Otra reserva',
}

export function subtypeLabel(kind: BookingKind, subtype: string | null): string {
  const list = kind === 'transport' ? TRANSPORT_TYPES : kind === 'lodging' ? LODGING_TYPES : OTHER_BOOKING_TYPES
  return list.find((t) => t.key === subtype)?.label ?? BOOKING_KIND_LABELS[kind]
}

/** Nights of a stay, calculated from check-in and check-out (null until both are known and make sense). */
export function nightsOf(checkIn: IsoDate | null, checkOut: IsoDate | null): number | null {
  if (!checkIn || !checkOut || checkOut <= checkIn) return null
  return daysBetween(checkIn, checkOut) - 1
}

export interface BookingRow {
  id: string
  owner_id: string
  trip_id: string | null
  group_id: string | null
  scope: 'personal' | 'shared'
  kind: BookingKind
  subtype: string | null
  title: string
  origin: string | null
  destination: string | null
  address: string | null
  starts_on: string | null
  ends_on: string | null
  total: number | string
  currency: TripCurrency
  pay_deadline: string | null
  notes: string | null
  status: 'active' | 'cancelled'
}

export function toBooking(row: BookingRow, participants: string[] = []): TripBooking {
  return {
    id: row.id,
    ownerId: row.owner_id,
    tripId: row.trip_id,
    groupId: row.group_id,
    scope: row.scope,
    kind: row.kind,
    subtype: row.subtype,
    title: row.title,
    origin: row.origin,
    destination: row.destination,
    address: row.address,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    totalCents: toCents(row.total),
    currency: row.currency,
    payDeadline: row.pay_deadline,
    notes: row.notes,
    status: row.status,
    participants,
  }
}

export interface BookingFormValues {
  kind: BookingKind
  subtype: string | null
  title: string
  origin: string
  destination: string
  address: string
  startsOn: IsoDate | null
  endsOn: IsoDate | null
  totalCents: Cents
  currency: TripCurrency
  payDeadline: IsoDate | null
  notes: string
  scope: 'personal' | 'shared'
  participants: string[]
}

/** Only the name and the cost are needed: everything else is optional. Returns the problem, or null when it can be saved. */
export function bookingProblem(v: Pick<BookingFormValues, 'title' | 'totalCents' | 'startsOn' | 'endsOn' | 'scope' | 'participants'>): string | null {
  if (!v.title.trim()) return 'Ponele un nombre a la reserva.'
  if (v.totalCents <= 0) return 'Poné el costo total.'
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) return 'La vuelta (o el check-out) no puede ser antes de la ida.'
  if (v.scope === 'shared' && v.participants.length === 0) return 'Elegí quiénes participan.'
  return null
}
