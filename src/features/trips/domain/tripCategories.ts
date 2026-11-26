/** The categories of an expense INSIDE a trip (the movement itself stays under the personal category «Viajes»). */
export interface TripCategory {
  /** A predefined key, or the id of a custom category. */
  key: string
  label: string
  /** Shorter name for chips (defaults to the label). */
  short?: string
  /** Name of a lucide icon (see TripCategoryIcon). */
  icon: string
  custom?: boolean
}

export const TRIP_CATEGORIES: readonly TripCategory[] = [
  { key: 'pasajes', label: 'Pasajes', icon: 'Plane' },
  { key: 'alojamiento', label: 'Alojamiento', icon: 'BedDouble' },
  { key: 'comidas', label: 'Comidas y bebidas', short: 'Comidas', icon: 'Utensils' },
  { key: 'transporte', label: 'Transporte', icon: 'Bus' },
  { key: 'compras', label: 'Compras', icon: 'ShoppingBag' },
  { key: 'actividades', label: 'Actividades y excursiones', short: 'Actividades', icon: 'Ticket' },
  { key: 'seguro', label: 'Seguro de viaje', short: 'Seguro', icon: 'ShieldCheck' },
  { key: 'salud', label: 'Salud', icon: 'HeartPulse' },
  { key: 'otros', label: 'Otros', icon: 'Tag' },
]

export const OTHER_CATEGORY_KEY = 'otros'

/** Predefined + custom ones, in that order. */
export function allTripCategories(custom: readonly { id: string; name: string; icon: string }[]): TripCategory[] {
  return [...TRIP_CATEGORIES, ...custom.map((c) => ({ key: c.id, label: c.name, icon: c.icon, custom: true }))]
}

/** The category for a stored key; anything unknown (or missing) is «Otros», never an error. */
export function categoryOf(key: string | null | undefined, all: readonly TripCategory[] = TRIP_CATEGORIES): TripCategory {
  return all.find((c) => c.key === key) ?? (TRIP_CATEGORIES.find((c) => c.key === OTHER_CATEGORY_KEY) as TripCategory)
}

/** Default category of a booking (so its payments land in the right place without asking). */
export function categoryForBooking(kind: 'transport' | 'lodging' | 'other', subtype: string | null): string {
  if (kind === 'transport') return 'pasajes'
  if (kind === 'lodging') return 'alojamiento'
  if (subtype === 'seguro') return 'seguro'
  if (subtype === 'excursion' || subtype === 'actividad') return 'actividades'
  if (subtype === 'auto') return 'transporte'
  return OTHER_CATEGORY_KEY
}
