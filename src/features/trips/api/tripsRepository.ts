import type { GroupTripRow, TripRow } from '@/shared/lib/database.types'
import type { Cents } from '@/shared/lib/money'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import { toTransaction } from '@/features/transactions/api/transactionsRepository'
import type { Transaction } from '@/features/transactions/domain/transaction'
import { toBooking, type BookingFormValues, type BookingRow, type TripBooking } from '../domain/bookings'
import type { SideExpenseRow } from '../domain/tripFinance'
import type { FundingChoice, GroupTripInfo, PersonalTrip, TripCurrency, TripFormValues } from '../domain/trip'

const toNumeric = (cents: number) => Number(fromCents(cents))

function toTrip(row: TripRow): PersonalTrip {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? null,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    budgetCents: row.budget == null ? 0 : toCents(row.budget),
    archivedAt: row.archived_at,
    destination: row.destination ?? null,
    currency: row.currency ?? 'ARS',
    funding: row.fund_source
      ? { source: row.fund_source, accountId: row.fund_account_id ?? null, ahorroCurrency: row.fund_ahorro_currency ?? null }
      : null,
  }
}

/** The columns of a trip form (a budget of 0 is "no budget": it is stored as null). */
function tripColumns(values: TripFormValues) {
  return {
    name: values.name,
    starts_on: values.startsOn,
    ends_on: values.endsOn,
    budget: values.budgetCents > 0 ? toNumeric(values.budgetCents) : null,
    destination: values.destination?.trim() ? values.destination.trim() : null,
    currency: values.currency ?? 'ARS',
    fund_source: values.funding?.source ?? null,
    fund_account_id: values.funding?.accountId ?? null,
    fund_ahorro_currency: values.funding?.ahorroCurrency ?? null,
  }
}

function toGroupTrip(row: GroupTripRow): GroupTripInfo {
  return {
    groupId: row.group_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    budgetCents: row.budget == null ? 0 : toCents(row.budget),
    destination: row.destination ?? null,
    currency: row.currency ?? 'ARS',
  }
}

/** PostgREST / Postgres answer these when a table or function of the trips migration does not exist yet. */
export function isTripsNotEnabled(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42703'
}

/** The person's own trips, soonest first. */
export async function listTrips(): Promise<PersonalTrip[]> {
  const { data, error } = await getSupabase()
    .from('trips')
    .select('*')
    .order('starts_on', { ascending: true })
  if (error) throw error
  return data.map(toTrip)
}

export async function createTrip(values: TripFormValues): Promise<PersonalTrip> {
  const { data, error } = await getSupabase()
    .from('trips')
    .insert(tripColumns(values))
    .select('*')
    .single()
  if (error) throw error
  return toTrip(data)
}

/** Destination, dates and budget of one of the person's own trips (its expenses stay linked). */
export async function updateTrip(id: string, values: TripFormValues): Promise<PersonalTrip> {
  const { data, error } = await getSupabase()
    .from('trips')
    .update(tripColumns(values))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return toTrip(data)
}

/** Only the look of the trip: nothing else about it (destination, dates, budget, expenses) changes. */
export async function setTripIcon(id: string, icon: string | null): Promise<void> {
  const { error } = await getSupabase().from('trips').update({ icon }).eq('id', id)
  if (error) throw error
}

/** Every posted expense that belongs to one of the person's trips (the same rows Actividad shows). */
export async function listTripExpenses(): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .select('*')
    .not('trip_id', 'is', null)
    .eq('status', 'posted')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(toTransaction)
}

/** Dates and budget of the group trips the person can see (RLS: only their groups). */
export async function listGroupTrips(): Promise<GroupTripInfo[]> {
  const { data, error } = await getSupabase().from('group_trips').select('*')
  if (error) throw error
  return data.map(toGroupTrip)
}

export async function setGroupTrip(
  groupId: string,
  values: Omit<TripFormValues, 'name'>,
): Promise<void> {
  const { error } = await getSupabase().rpc('set_group_trip', {
    p_group: groupId,
    p_starts_on: values.startsOn,
    p_ends_on: values.endsOn,
    p_budget: values.budgetCents > 0 ? toNumeric(values.budgetCents) : null,
    p_destination: values.destination?.trim() ? values.destination.trim() : null,
    p_currency: values.currency ?? 'ARS',
  })
  if (error) throw error
}

// ---- Side expenses (savings without a movement, or "de otro lado"), expenses with their origin of money --------------------------

export interface SideExpense extends SideExpenseRow {
  trip_id: string | null
}

export async function listSideExpenses(): Promise<SideExpense[]> {
  const { data, error } = await getSupabase()
    .from('trip_side_expenses')
    .select('*')
    .eq('status', 'posted')
    .order('occurred_on', { ascending: false })
  if (error) throw error
  return data as unknown as SideExpense[]
}

export interface NewTripExpense {
  /** null only when paying one of my personal bookings of a group trip. */
  tripId: string | null
  /** In `currency` (cents). */
  amountCents: Cents
  currency: TripCurrency
  /** Pesos per dollar, needed when a dollar amount touches the person's accounts. */
  fxRate?: number | null
  description?: string
  occurredOn?: string
  categoryKey?: string | null
  funding: FundingChoice
  /** The booking this expense pays (a payment), if any. */
  bookingId?: string | null
}

/** One expense from the chosen origin of the money (balance, savings or elsewhere); the server does every step at once. */
export async function addTripExpense(v: NewTripExpense): Promise<{ transactionId: string | null; sideExpenseId: string | null }> {
  const { data, error } = await getSupabase().rpc('add_trip_expense', {
    p_trip: v.tripId,
    p_amount: toNumeric(v.amountCents),
    p_currency: v.currency,
    p_fx_rate: v.fxRate ?? null,
    p_description: v.description?.trim() || null,
    p_on: v.occurredOn ?? null,
    p_category: v.categoryKey ?? null,
    p_funding: v.funding.source,
    p_account: v.funding.accountId,
    p_ahorro_currency: v.funding.source === 'savings' ? v.funding.ahorroCurrency : null,
    p_booking: v.bookingId ?? null,
  })
  if (error) throw error
  const row = (data ?? {}) as { transaction_id?: string | null; side_expense_id?: string | null }
  return { transactionId: row.transaction_id ?? null, sideExpenseId: row.side_expense_id ?? null }
}

/** Enters (once, for good) the rate of an expense that was saved without one: from then on its value in the trip's currency is fixed. */
export async function setTripExpenseRate(kind: 'transaction' | 'side', id: string, rate: number): Promise<void> {
  const { error } = await getSupabase().rpc('set_trip_expense_rate', { p_kind: kind, p_id: id, p_rate: rate })
  if (error) throw error
}

export async function voidSideExpense(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_trip_side_expense', { p_id: id })
  if (error) throw error
}

/** My posted expenses that pay a booking (also the ones of a group trip, which belong to no personal trip). */
export async function listBookingMovements(): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .select('*')
    .not('booking_id', 'is', null)
    .eq('status', 'posted')
  if (error) throw error
  return data.map(toTransaction)
}

/** Links (or, with null, unlinks) an existing movement of the person to a booking of the same trip. */
export async function linkMovementToBooking(transactionId: string, bookingId: string | null, tripId?: string): Promise<void> {
  const { error } = await getSupabase()
    .from('transactions')
    .update(bookingId && tripId ? { booking_id: bookingId, trip_id: tripId } : { booking_id: bookingId })
    .eq('id', transactionId)
  if (error) throw error
}

// ---- Bookings -----------------------------------------------------------------------------------------------------------------------

/** Every booking the person can see (their own, and the shared ones of their groups), with who participates in the shared ones. */
export async function listBookings(): Promise<TripBooking[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('trip_bookings').select('*').order('starts_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  const rows = data as unknown as BookingRow[]
  const shared = rows.filter((r) => r.scope === 'shared').map((r) => r.id)
  const byBooking = new Map<string, string[]>()
  if (shared.length > 0) {
    const people = await supabase.from('trip_booking_participants').select('booking_id, user_id').in('booking_id', shared)
    if (people.error) throw people.error
    for (const p of people.data) byBooking.set(p.booking_id, [...(byBooking.get(p.booking_id) ?? []), p.user_id])
  }
  return rows.map((r) => toBooking(r, byBooking.get(r.id) ?? []))
}

function bookingColumns(v: BookingFormValues) {
  return {
    kind: v.kind,
    subtype: v.subtype,
    title: v.title.trim(),
    origin: v.origin.trim() || null,
    destination: v.destination.trim() || null,
    address: v.address.trim() || null,
    starts_on: v.startsOn,
    ends_on: v.endsOn,
    total: toNumeric(v.totalCents),
    currency: v.currency,
    pay_deadline: v.payDeadline,
    notes: v.notes.trim() || null,
  }
}

export type BookingTarget = { tripId: string } | { groupId: string }

export async function createBooking(target: BookingTarget, v: BookingFormValues): Promise<string> {
  const supabase = getSupabase()
  const scope = 'groupId' in target ? v.scope : 'personal'
  const { data, error } = await supabase
    .from('trip_bookings')
    .insert({
      ...bookingColumns(v),
      scope,
      trip_id: 'tripId' in target ? target.tripId : null,
      group_id: 'groupId' in target ? target.groupId : null,
    })
    .select('id')
    .single()
  if (error) throw error
  if (scope === 'shared' && v.participants.length > 0) {
    const people = await supabase
      .from('trip_booking_participants')
      .insert(v.participants.map((user_id) => ({ booking_id: data.id, user_id })))
    if (people.error) throw people.error
  }
  return data.id
}

export async function updateBooking(id: string, v: BookingFormValues): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('trip_bookings').update(bookingColumns(v)).eq('id', id)
  if (error) throw error
  if (v.scope === 'shared') {
    const del = await supabase.from('trip_booking_participants').delete().eq('booking_id', id)
    if (del.error) throw del.error
    if (v.participants.length > 0) {
      const ins = await supabase.from('trip_booking_participants').insert(v.participants.map((user_id) => ({ booking_id: id, user_id })))
      if (ins.error) throw ins.error
    }
  }
}

/** Cancelling keeps what was already paid (those are real expenses); it only stops the pending part from counting. */
export async function setBookingCancelled(id: string, cancelled: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('trip_bookings')
    .update({ status: cancelled ? 'cancelled' : 'active', cancelled_at: cancelled ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

/** The server refuses it while the booking has payments (cancel it instead, or delete those expenses first). */
export async function deleteBooking(id: string): Promise<void> {
  const { error } = await getSupabase().from('trip_bookings').delete().eq('id', id)
  if (error) throw error
}

// ---- Custom categories, shared trips -------------------------------------------------------------------------------------------------

export interface CustomTripCategory {
  id: string
  name: string
  icon: string
}

export async function listTripCategories(): Promise<CustomTripCategory[]> {
  const { data, error } = await getSupabase().from('trip_categories').select('id, name, icon').order('name')
  if (error) throw error
  return data
}

export async function createTripCategory(name: string, icon = 'Tag'): Promise<CustomTripCategory> {
  const { data, error } = await getSupabase().from('trip_categories').insert({ name: name.trim(), icon }).select('id, name, icon').single()
  if (error) throw error
  return data
}

/** What each shared booking of the group has collected (members only). */
export async function listGroupBookingPaid(groupId: string): Promise<Map<string, Cents>> {
  const { data, error } = await getSupabase().rpc('get_group_booking_paid', { p_group: groupId })
  if (error) throw error
  return new Map(data.map((r) => [r.booking_id, toCents(r.paid)]))
}

/** Makes a shared expense of the group a payment of a shared booking (or, with null, detaches it). */
export async function linkSharedExpenseToBooking(expenseId: string, bookingId: string | null): Promise<void> {
  const { error } = await getSupabase().rpc('link_shared_expense_booking', { p_expense: expenseId, p_booking: bookingId })
  if (error) throw error
}

/** My private default origin of the money for a group trip (nobody else can read it). */
export async function getMyGroupFunding(groupId: string): Promise<FundingChoice | null> {
  const { data, error } = await getSupabase().from('trip_member_prefs').select('*').eq('group_id', groupId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { source: data.fund_source, accountId: data.fund_account_id, ahorroCurrency: data.fund_ahorro_currency }
}

export async function setMyGroupFunding(groupId: string, funding: FundingChoice): Promise<void> {
  const { error } = await getSupabase()
    .from('trip_member_prefs')
    .upsert({
      group_id: groupId,
      fund_source: funding.source,
      fund_account_id: funding.accountId,
      fund_ahorro_currency: funding.ahorroCurrency,
    })
  if (error) throw error
}

/** Funds a shared expense I paid from the savings reserved in the account I paid with (the reservation is released, nothing is charged twice). */
export async function fundSharedPaymentFromSavings(expenseId: string): Promise<void> {
  const { error } = await getSupabase().rpc('fund_shared_payment_from_savings', { p_expense: expenseId })
  if (error) throw error
}
