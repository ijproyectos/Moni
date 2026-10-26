// Hand-written to match supabase/migrations. Replace with `supabase gen types typescript` once the CLI is linked.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          base_currency: string
          goals: string[]
          onboarding_completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          base_currency?: string
          goals?: string[]
          onboarding_completed_at?: string | null
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
          goals?: string[]
          onboarding_completed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
