import type { GroupTripRow, TripRow } from '@/shared/lib/database.types'
import { fromCents, toCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import { toTransaction } from '@/features/transactions/api/transactionsRepository'
import type { Transaction } from '@/features/transactions/domain/transaction'
import type { GroupTripInfo, PersonalTrip, TripFormValues } from '../domain/trip'

const toNumeric = (cents: number) => Number(fromCents(cents))

function toTrip(row: TripRow): PersonalTrip {
  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    budgetCents: toCents(row.budget),
    archivedAt: row.archived_at,
  }
}

function toGroupTrip(row: GroupTripRow): GroupTripInfo {
  return {
    groupId: row.group_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    budgetCents: toCents(row.budget),
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
    .insert({
      name: values.name,
      starts_on: values.startsOn,
      ends_on: values.endsOn,
      budget: toNumeric(values.budgetCents),
    })
    .select('*')
    .single()
  if (error) throw error
  return toTrip(data)
}

/** Destination, dates and budget of one of the person's own trips (its expenses stay linked). */
export async function updateTrip(id: string, values: TripFormValues): Promise<PersonalTrip> {
  const { data, error } = await getSupabase()
    .from('trips')
    .update({
      name: values.name,
      starts_on: values.startsOn,
      ends_on: values.endsOn,
      budget: toNumeric(values.budgetCents),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return toTrip(data)
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
    p_budget: toNumeric(values.budgetCents),
  })
  if (error) throw error
}
