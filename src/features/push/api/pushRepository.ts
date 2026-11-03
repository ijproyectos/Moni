import { getSupabase } from '@/shared/lib/supabase'
import type { RegisterPushArgs } from '../domain/push'

// Push is always on: the app can register a device, never remove one. Dead endpoints are pruned by the server
// (push-send) when the push service reports them gone.
export async function registerPushSubscription(args: RegisterPushArgs): Promise<void> {
  const { error } = await getSupabase().rpc('register_push_subscription', args)
  if (error) throw new Error(error.message)
}
