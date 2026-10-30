import { getSupabase } from '@/shared/lib/supabase'
import { isPlusActive } from '../domain/plus'

/** When the caller's Plus ends, or null on Free (never had it, or it expired). */
export async function getPlusExpiry(): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('my_plus_status')
  if (error) throw error
  return data
}

/**
 * Redeems a promo code and returns when Plus ends. The code is checked only in the database.
 * A wrong code comes back as NULL (the server records the failed attempt); a code this user already used comes back
 * with the existing end date, which is in the past once it ran out.
 */
export async function redeemPromoCode(code: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('redeem_promo_code', { p_code: code })
  if (error) throw error
  if (!data) throw new Error('promo_invalid')
  if (!isPlusActive(data)) throw new Error('promo_already_used')
  return data
}
