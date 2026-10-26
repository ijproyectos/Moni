import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { envResult } from './env'

// Only the publishable key ever reaches the browser. Privileged keys stay server-side.
export const supabase: SupabaseClient<Database> | null = envResult.ok
  ? createClient<Database>(
      envResult.env.VITE_SUPABASE_URL,
      envResult.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    )
  : null

export function getSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
