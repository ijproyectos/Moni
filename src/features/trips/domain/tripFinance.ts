import type { Transaction } from '@/features/transactions/domain/transaction'
import { toCents, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'
import { daysBetween } from './dates'
import type { TripBooking } from './bookings'
import { OTHER_CATEGORY_KEY } from './tripCategories'
import type { FundSource, TripCurrency } from './trip'

/**
 * ONE place decides what a trip has spent and committed. An expense counts once: a booking's payments are expenses that point at the
 * booking, so the booking only adds what is STILL pending (total - paid). Nothing here writes anything.
 */

/** One expense of a trip, wherever it is stored (a movement of the person, or a side expense with no movement). */
export interface SpendItem {
  id: string
  source: 'movement' | 'side'
  occurredOn: IsoDate
  title: string
  categoryKey: string | null
  bookingId: string | null
  funding: FundSource
  /** The value in pesos and in dollars when known (each one only if it was really recorded in that currency). */
  ars: Cents | null
  usd: Cents | null
  movement?: Transaction
}

export interface SideExpenseRow {
  id: string
  amount: number | string
  currency: TripCurrency
  fx_rate: number | string | null
  description: string | null
  occurred_on: string
  trip_category: string | null
  booking_id: string | null
  funding: 'external' | 'savings'
}

export function spendFromMovement(t: Transaction): SpendItem {
  const usd = t.originalCurrency === 'USD' && t.originalAmountCents ? t.originalAmountCents : null
  return {
    id: t.id,
    source: 'movement',
    occurredOn: t.occurredOn,
    title: t.note?.trim() || '',
    categoryKey: t.tripCategory ?? null,
    bookingId: t.bookingId ?? null,
    funding: t.funding === 'savings' ? 'savings' : 'balance',
    ars: t.amountCents,
    usd,
    movement: t,
  }
}

export function spendFromSide(row: SideExpenseRow): SpendItem {
  const cents = toCents(row.amount)
  const rate = row.fx_rate == null ? null : Number(row.fx_rate)
  const isUsd = row.currency === 'USD'
  return {
    id: row.id,
    source: 'side',
    occurredOn: row.occurred_on,
    title: row.description?.trim() ?? '',
    categoryKey: row.trip_category,
    bookingId: row.booking_id,
    funding: row.funding,
    ars: isUsd ? (rate ? Math.round(cents * rate) : null) : cents,
    usd: isUsd ? cents : null,
  }
}

/** Converts between pesos and dollars with the pesos-per-dollar rate given; null when it cannot be done (no rate: nothing is invented). */
export function convertCents(cents: Cents, from: TripCurrency, to: TripCurrency, arsPerUsd: number | null): Cents | null {
  if (from === to) return cents
  if (!arsPerUsd || arsPerUsd <= 0) return null
  return from === 'USD' ? Math.round(cents * arsPerUsd) : Math.round(cents / arsPerUsd)
}

/** The item's value in a currency: the recorded one when it exists, otherwise converted with the rate, otherwise null. */
export function valueIn(item: Pick<SpendItem, 'ars' | 'usd'>, currency: TripCurrency, arsPerUsd: number | null): Cents | null {
  const own = currency === 'USD' ? item.usd : item.ars
  if (own !== null) return own
  const other = currency === 'USD' ? item.ars : item.usd
  if (other === null) return null
  return convertCents(other, currency === 'USD' ? 'ARS' : 'USD', currency, arsPerUsd)
}

export interface BookingState {
  booking: TripBooking
  /** In the booking's own currency. */
  paidCents: Cents
  pendingCents: Cents
  /** 0 when the booking is cancelled or fully paid. */
  overpaid: boolean
  paymentCount: number
  /** Some payment could not be converted to the booking's currency (no rate): the paid amount may be short. */
  unconverted: boolean
}

/** Paid / pending of each booking from the expenses that point at it (never from anything else, so nothing counts twice). */
export function bookingStates(
  bookings: readonly TripBooking[],
  items: readonly SpendItem[],
  arsPerUsd: number | null,
  /** Shared bookings: what the group's shared expenses already collected (the RPC), by booking id. */
  sharedPaid: ReadonlyMap<string, Cents> = new Map(),
): BookingState[] {
  return bookings.map((booking) => {
    const linked = items.filter((i) => i.bookingId === booking.id)
    let paid = 0
    let unconverted = false
    for (const item of linked) {
      const value = valueIn(item, booking.currency, arsPerUsd)
      if (value === null) unconverted = true
      else paid += value
    }
    const collected = sharedPaid.get(booking.id)
    if (collected !== undefined) {
      const value = convertCents(collected, 'ARS', booking.currency, arsPerUsd)
      if (value === null) unconverted = true
      else paid += value
    }
    const active = booking.status === 'active'
    return {
      booking,
      paidCents: paid,
      pendingCents: active ? Math.max(0, booking.totalCents - paid) : 0,
      overpaid: active && paid > booking.totalCents,
      paymentCount: linked.length + (collected ? 1 : 0),
      unconverted,
    }
  })
}

export interface CategorySpendRow {
  key: string
  cents: Cents
  share: number
}

export interface TripFinance {
  currency: TripCurrency
  hasBudget: boolean
  budgetCents: Cents
  /** Registered expenses, booking payments included. */
  spentCents: Cents
  /** What active bookings still owe (a commitment: nothing has left the person's finances for it yet). */
  pendingCents: Cents
  committedCents: Cents
  /** Budget minus expenses and commitments; null without a budget (no invented numbers). Negative when exceeded. */
  availableCents: number | null
  /** Share of the budget used by expenses / by expenses + commitments; null without a budget. */
  spentShare: number | null
  committedShare: number | null
  overBudget: boolean
  byCategory: CategorySpendRow[]
  expenseCount: number
  /** How many amounts could not be converted to the trip's currency (they are left out and flagged). */
  unconvertedCount: number
  /** What is left to spend per remaining day, only with a budget, something available and days ahead. */
  perDayCents: Cents | null
  daysLeft: number
}

export function tripFinance(input: {
  currency: TripCurrency
  budgetCents: Cents
  startsOn: IsoDate
  endsOn: IsoDate
  today: IsoDate
  items: readonly SpendItem[]
  bookings: readonly BookingState[]
  arsPerUsd: number | null
}): TripFinance {
  const { currency, budgetCents, arsPerUsd } = input
  let spent = 0
  let unconvertedCount = 0
  const totals = new Map<string, number>()
  for (const item of input.items) {
    const value = valueIn(item, currency, arsPerUsd)
    if (value === null) {
      unconvertedCount += 1
      continue
    }
    spent += value
    const key = item.categoryKey ?? OTHER_CATEGORY_KEY
    totals.set(key, (totals.get(key) ?? 0) + value)
  }
  let pending = 0
  for (const state of input.bookings) {
    if (state.pendingCents === 0) continue
    const value = convertCents(state.pendingCents, state.booking.currency, currency, arsPerUsd)
    if (value === null) unconvertedCount += 1
    else pending += value
  }
  const hasBudget = budgetCents > 0
  const committed = spent + pending
  const available = hasBudget ? budgetCents - committed : null
  const status = input.today < input.startsOn ? 'upcoming' : input.today > input.endsOn ? 'ended' : 'ongoing'
  const totalDays = daysBetween(input.startsOn, input.endsOn)
  const daysLeft = status === 'ended' ? 0 : status === 'upcoming' ? totalDays : daysBetween(input.today, input.endsOn)
  return {
    currency,
    hasBudget,
    budgetCents,
    spentCents: spent,
    pendingCents: pending,
    committedCents: committed,
    availableCents: available,
    spentShare: hasBudget ? spent / budgetCents : null,
    committedShare: hasBudget ? committed / budgetCents : null,
    overBudget: hasBudget && committed > budgetCents,
    byCategory: [...totals.entries()]
      .map(([key, cents]) => ({ key, cents, share: spent > 0 ? cents / spent : 0 }))
      .sort((a, b) => b.cents - a.cents),
    expenseCount: input.items.length,
    unconvertedCount,
    perDayCents: available !== null && available > 0 && daysLeft > 0 ? Math.floor(available / daysLeft) : null,
    daysLeft,
  }
}

/** My part of a booking: a personal one is all mine; a shared one is split equally among its participants (0 if I am not one). */
export function myShareOfBooking(booking: Pick<TripBooking, 'scope' | 'participants' | 'totalCents'>, meId: string): Cents {
  if (booking.scope === 'personal') return booking.totalCents
  if (!booking.participants.includes(meId)) return 0
  return Math.round(booking.totalCents / booking.participants.length)
}
