import type { Cents } from '@/shared/lib/money'
import { daysBetween } from './dates'
import type { BookingState, TripFinance } from './tripFinance'
import { categoryOf, type TripCategory } from './tripCategories'
import { moneyIn } from './money'

/**
 * Moni's reading of a trip (Moni Plus). Plain rules over the trip's own numbers: nothing is estimated and nothing is said without
 * enough information (no budget, no bookings, no expenses or no days left means that line simply does not appear).
 */
export interface TripInsight {
  id: string
  text: string
}

const MIN_EXPENSES_FOR_PATTERNS = 5

export function tripInsights(input: {
  finance: TripFinance
  bookings: readonly BookingState[]
  today: string
  categories?: readonly TripCategory[]
  status: 'upcoming' | 'ongoing' | 'ended'
}): TripInsight[] {
  const { finance, bookings, today, status } = input
  if (status === 'ended') return []
  const out: TripInsight[] = []
  const cur = finance.currency

  // 1. Deadlines: the ones that matter most come first.
  const due = bookings
    .filter((b) => b.pendingCents > 0 && b.booking.payDeadline)
    .map((b) => ({ b, days: daysBetween(today, b.booking.payDeadline as string) - 1 }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)
  for (const { b, days } of due.slice(0, 2)) {
    const when = days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`
    out.push({ id: `due-${b.booking.id}`, text: `${when} vence el pago de ${b.booking.title}: te faltan ${moneyIn(b.pendingCents, b.booking.currency)}.` })
  }

  // 2. What is paid and what is still owed of the bookings (only when there are bookings with a real total).
  const active = bookings.filter((b) => b.booking.status === 'active')
  if (active.length > 0) {
    const pending = active.filter((b) => b.pendingCents > 0)
    const paidOnes = active.filter((b) => b.pendingCents === 0)
    if (pending.length === 0) out.push({ id: 'all-paid', text: 'Todas tus reservas están pagas.' })
    else if (paidOnes.length > 0) {
      const names = paidOnes.map((b) => b.booking.title).slice(0, 2).join(' y ')
      const owe = pending.map((b) => `${moneyIn(b.pendingCents, b.booking.currency)} de ${b.booking.title}`).slice(0, 2).join(' y ')
      out.push({ id: 'paid-vs-pending', text: `Ya tenés pago ${names}. Te quedan ${owe}.` })
    }
  }

  // 3. What is left of the budget after the commitments (needs a budget).
  if (finance.availableCents !== null && finance.pendingCents > 0 && finance.availableCents >= 0) {
    out.push({ id: 'after-commitments', text: `Después de cubrir tus reservas, te quedan ${moneyIn(finance.availableCents, cur)} de presupuesto para disfrutar el viaje.` })
  }
  if (finance.overBudget && finance.availableCents !== null) {
    out.push({ id: 'over', text: `Con lo gastado y lo comprometido te pasás ${moneyIn(-finance.availableCents, cur)} del presupuesto.` })
  }

  // 4. Per day, only during the trip or before it with days ahead (needs a budget and something left).
  if (finance.perDayCents !== null && finance.availableCents !== null && finance.daysLeft > 0) {
    out.push({
      id: 'per-day',
      text: `Te quedan ${finance.daysLeft} ${finance.daysLeft === 1 ? 'día' : 'días'} de viaje y ${moneyIn(finance.availableCents, cur)} de presupuesto. Podrías disponer de ${moneyIn(finance.perDayCents, cur)} por día.`,
    })
  }

  // 5. Where the money goes: only with enough expenses and a clear leader (not a tie, not a single category).
  if (finance.expenseCount >= MIN_EXPENSES_FOR_PATTERNS && finance.byCategory.length >= 2) {
    const [first, second] = finance.byCategory as [{ key: string; share: number; cents: Cents }, { key: string; share: number; cents: Cents }]
    if (first.share >= 0.4 && first.cents >= second.cents * 1.5 && first.key !== 'otros') {
      const name = categoryOf(first.key, input.categories).label.toLowerCase()
      out.push({ id: 'top-category', text: `Estás gastando más en ${name} que en otras categorías (${Math.round(first.share * 100)}% de lo gastado).` })
    }
  }
  return out.slice(0, 4)
}
