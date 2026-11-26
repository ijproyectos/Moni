import { BedDouble, Bus, HeartPulse, Plane, ShieldCheck, ShoppingBag, Tag, Ticket, Utensils, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = { Plane, BedDouble, Utensils, Bus, ShoppingBag, Ticket, ShieldCheck, HeartPulse, Tag }

/** The icon of a trip category (an unknown one falls back to the generic tag). */
export function TripCategoryIcon({ icon, className = 'size-5' }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Tag
  return <Icon aria-hidden="true" className={className} strokeWidth={2} />
}
