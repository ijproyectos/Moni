import { getSupabase } from '@/shared/lib/supabase'
import type { RegisterPushArgs } from '../domain/push'

export async function registerPushSubscription(args: RegisterPushArgs): Promise<void> {
  const { error } = await getSupabase().rpc('register_push_subscription', args)
  if (error) throw new Error(error.message)
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await getSupabase().rpc('remove_push_subscription', { p_endpoint: endpoint })
  if (error) throw new Error(error.message)
}
