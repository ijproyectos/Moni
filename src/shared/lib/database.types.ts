// Hand-written to match supabase/migrations. Replace with `supabase gen types typescript` once the CLI is linked.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type CategoryKind = 'expense' | 'income'
export type AccountKind = 'cash' | 'bank' | 'wallet' | 'credit_card'
export type TransactionKind =
  | 'expense'
  | 'income'
  | 'shared_payment'
  | 'settlement_out'
  | 'settlement_in'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'opening_in'
export type RowStatus = 'posted' | 'voided'
export type GroupKind = 'casa' | 'viaje' | 'pareja' | 'amigos'
export type GroupRole = 'owner' | 'member'
export type SplitMethod = 'equal' | 'percent'

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
          /** Added by the proposed migration 20261028000000; absent until it is applied. */
          secondary_currency?: string | null
          notifications_opt_in?: boolean | null
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
          secondary_currency?: string | null
          notifications_opt_in?: boolean | null
        }
        Relationships: []
      }
      category_templates: {
        Row: {
          slug: string
          kind: CategoryKind
          name: string
          icon: string
          color: string
          sort_order: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          owner_id: string
          kind: CategoryKind
          name: string
          icon: string
          color: string
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          kind: CategoryKind
          name: string
          icon: string
          color: string
        }
        Update: {
          name?: string
          icon?: string
          color?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          owner_id: string
          name: string
          kind: AccountKind
          currency: string
          opening_balance: number
          archived_at: string | null
          /** Card settings (migration 20261030000000); absent until it is applied. */
          credit_limit?: number | null
          closing_day?: number | null
          due_day?: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          kind: AccountKind
          opening_balance?: number
          credit_limit?: number | null
          closing_day?: number | null
          due_day?: number | null
        }
        Update: {
          name?: string
          kind?: AccountKind
          opening_balance?: number
          archived_at?: string | null
          credit_limit?: number | null
          closing_day?: number | null
          due_day?: number | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          owner_id: string
          account_id: string
          category_id: string | null
          kind: TransactionKind
          amount: number
          occurred_on: string
          note: string | null
          status: RowStatus
          voided_at: string | null
          shared_expense_id: string | null
          settlement_id: string | null
          /** Statement a card charge belongs to and installment data (migration 20261030000000). */
          statement_closing_on?: string | null
          installment_plan_id?: string | null
          installment_number?: number | null
          installments_total?: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          account_id: string
          category_id: string
          kind: 'expense' | 'income'
          amount: number
          occurred_on?: string
          note?: string | null
        }
        Update: {
          account_id?: string
          category_id?: string
          amount?: number
          occurred_on?: string
          note?: string | null
          status?: RowStatus
        }
        Relationships: []
      }
      installment_plans: {
        Row: {
          id: string
          owner_id: string
          account_id: string
          category_id: string
          description: string
          total_amount: number
          installments_count: number
          first_number: number
          purchase_on: string
          first_statement_closing_on: string
          status: RowStatus
          voided_at: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      transfers: {
        Row: {
          id: string
          owner_id: string
          from_account_id: string
          to_account_id: string
          amount: number
          occurred_on: string
          note: string | null
          status: RowStatus
          voided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          from_account_id: string
          to_account_id: string
          amount: number
          occurred_on?: string
          note?: string | null
        }
        Update: {
          from_account_id?: string
          to_account_id?: string
          amount?: number
          occurred_on?: string
          note?: string | null
          status?: RowStatus
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          kind: GroupKind
          currency: string
          created_by: string
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          user_id: string
          role: GroupRole
          joined_at: string
          left_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      group_invites: {
        Row: {
          id: string
          group_id: string
          code: string
          created_by: string
          expires_at: string
          max_uses: number
          uses: number
          revoked_at: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      shared_expenses: {
        Row: {
          id: string
          group_id: string
          paid_by: string
          amount: number
          description: string
          template_slug: string | null
          occurred_on: string
          split_method: SplitMethod
          status: RowStatus
          voided_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      shared_expense_splits: {
        Row: {
          expense_id: string
          group_id: string
          user_id: string
          share_amount: number
          percent: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      settlements: {
        Row: {
          id: string
          group_id: string
          from_user: string
          to_user: string
          amount: number
          occurred_on: string
          note: string | null
          status: RowStatus
          voided_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          owner_id: string
          category_id: string
          amount: number
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          category_id: string
          amount: number
        }
        Update: {
          amount?: number
          archived_at?: string | null
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          id: string
          owner_id: string
          feature: string
          created_at: string
        }
        Insert: Record<never, never>
        Update: Record<never, never>
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string
          owner_id: string
          currency: string
          archived_at: string | null
          opening_balance: number
          balance: number
        }
        Relationships: []
      }
    }
    Functions: {
      complete_onboarding: {
        Args: { p_goals: string[]; p_template_slugs: string[] }
        Returns: undefined
      }
      /** Proposed migration 20261028000000_onboarding_preferences. */
      complete_onboarding_v2: {
        Args: {
          p_goals: string[]
          p_template_slugs: string[]
          p_custom_categories?: Json
          p_secondary_currency?: string | null
          p_notifications_opt_in?: boolean | null
        }
        Returns: undefined
      }
      /** Migration 20261029000000: records the difference as one adjustment; returns it. */
      adjust_account_balance: {
        Args: { p_account: string; p_target: number; p_note?: string | null }
        Returns: number
      }
      /** Migration 20261034000000: creates the account and its opening movement in one transaction. */
      create_account_with_opening: {
        Args: {
          p_name: string
          p_kind: string
          p_amount: number
          p_source: string
          p_category?: string | null
          p_on?: string | null
        }
        Returns: string
      }
      /** Migration 20261034000000: turns opening_balance into a movement; returns the amount. */
      classify_opening_balance: {
        Args: {
          p_account: string
          p_source: string
          p_category?: string | null
          p_on?: string | null
        }
        Returns: number
      }
      /** Migration 20261030000000. */
      create_installment_purchase: {
        Args: {
          p_account: string
          p_description: string
          p_category: string
          p_total: number
          p_count: number
          p_current_number?: number
          p_purchase_on?: string | null
          p_first_closing?: string | null
          p_request_key?: string | null
        }
        Returns: string
      }
      void_installment_plan: {
        Args: { p_plan: string }
        Returns: number
      }
      get_card_overview: {
        Args: { p_account: string; p_today?: string | null }
        Returns: Json
      }
      get_month_summary: {
        Args: { p_month: string }
        Returns: Json
      }
      get_period_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_ant_expenses: {
        Args: { p_month: string; p_max_amount?: number | null }
        Returns: Json
      }
      get_budget_status: {
        Args: { p_month: string }
        Returns: Json
      }
      suggest_budgets: {
        Args: Record<never, never>
        Returns: Json
      }
      consume_ai_quota: {
        Args: { p_feature: string; p_daily_limit?: number }
        Returns: number
      }
      create_group: {
        Args: { p_name: string; p_kind: GroupKind }
        Returns: string
      }
      create_group_invite: {
        Args: { p_group: string }
        Returns: string
      }
      revoke_group_invite: {
        Args: { p_invite: string }
        Returns: undefined
      }
      join_group: {
        Args: { p_code: string }
        Returns: string | null
      }
      leave_group: {
        Args: { p_group: string }
        Returns: undefined
      }
      get_group_members: {
        Args: { p_group: string }
        Returns: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          role: GroupRole
          joined_at: string
          left_at: string | null
        }[]
      }
      create_shared_expense: {
        Args: {
          p_group: string
          p_amount: number
          p_description: string
          p_template_slug: string | null
          p_occurred_on: string
          p_paid_by: string
          p_split_method: SplitMethod
          p_participants: string[]
          p_percents?: number[] | null
          p_payer_account_id?: string | null
        }
        Returns: string
      }
      void_shared_expense: {
        Args: { p_expense: string }
        Returns: undefined
      }
      create_settlement: {
        Args: {
          p_group: string
          p_to_user: string
          p_amount: number
          p_occurred_on?: string | null
          p_note?: string | null
          p_account_id?: string | null
        }
        Returns: string
      }
      record_settlement_receipt: {
        Args: { p_settlement: string; p_account_id: string }
        Returns: string
      }
      void_settlement: {
        Args: { p_settlement: string }
        Returns: undefined
      }
      get_group_balances: {
        Args: { p_group: string }
        Returns: Json
      }
      get_my_groups: {
        Args: Record<never, never>
        Returns: {
          id: string
          name: string
          kind: GroupKind
          role: GroupRole
          member_count: number
          my_net: number
          last_activity: string
        }[]
      }
      is_group_member: {
        Args: { p_group: string }
        Returns: boolean
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type CategoryTemplate = Database['public']['Tables']['category_templates']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Account = Database['public']['Tables']['accounts']['Row']
export type Transaction = Database['public']['Tables']['transactions']['Row']
export type Budget = Database['public']['Tables']['budgets']['Row']
export type Transfer = Database['public']['Tables']['transfers']['Row']
export type Group = Database['public']['Tables']['groups']['Row']
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row']
export type GroupInviteRow = Database['public']['Tables']['group_invites']['Row']
export type SharedExpenseRow = Database['public']['Tables']['shared_expenses']['Row']
export type SharedExpenseSplitRow = Database['public']['Tables']['shared_expense_splits']['Row']
export type SettlementRow = Database['public']['Tables']['settlements']['Row']
