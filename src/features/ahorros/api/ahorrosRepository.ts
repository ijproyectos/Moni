import { fromCents } from '@/shared/lib/money'
import { getSupabase } from '@/shared/lib/supabase'
import { toEntry, type AhorroCurrency, type AhorroEntry, type AhorroKind, type AhorroRow } from '../domain/ahorros'

/** Every entry of the person (RLS: only their own), newest first. */
export async function listAhorros(): Promise<AhorroEntry[]> {
  const { data, error } = await getSupabase()
    .from('ahorro_entries')
    .select('*')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as AhorroRow[]).map(toEntry)
}

export interface NewAhorro {
  currency: AhorroCurrency
  kind: AhorroKind
  amountCents: number
  occurredOn?: string
  note?: string
  accountId?: string | null
  /** Makes a double tap on "Guardar" a single entry. */
  requestKey: string
}

export async function createAhorro(values: NewAhorro): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_ahorro_entry', {
    p_currency: values.currency,
    p_kind: values.kind,
    p_amount: Number(fromCents(values.amountCents)),
    p_on: values.occurredOn ?? null,
    p_note: values.note?.trim() || null,
    p_account: values.accountId ?? null,
    p_request_key: values.requestKey,
  })
  if (error) throw error
  return data
}

export async function voidAhorro(entryId: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_ahorro_entry', { p_entry: entryId })
  if (error) throw error
}
