// Shapes returned by the admin-panel Edge Function (see supabase/migrations/20261114000000_admin_panel.sql).
// Only account data, counts, dates, amounts and system state: never free text written by users.

export interface Resumen {
  users_total: number
  users_new_7d: number
  users_new_30d: number
  active_today: number
  active_7d: number
  active_30d: number
  plus_active: number
  plus_expired: number
  mp_linked: number
  ai_calls_today: number
  ai_calls_month: number
  ai_cost_tracked: boolean
  alerts: {
    mp_needs_reconnect: number
    mp_sync_errors: number
    mp_import_failures: number
    plus_authorized_without_payment: number
    cron_failures_24h: number | null
  }
}

export interface UserRow {
  o_user_id: string
  o_email: string | null
  o_name: string | null
  o_created_at: string
  o_last_sign_in_at: string | null
  o_last_activity_at: string
  o_days_inactive: number
  o_plus_expires_at: string | null
  o_plus_active: boolean
  o_mp_linked: boolean
  o_movements_total: number
  o_accounts_total: number
  o_movements_30d: number
  o_suspended: boolean
}

export interface UsersPage {
  rows: UserRow[]
  total: number
}

export type UserFilter = 'todos' | 'plus' | 'inactivos_7' | 'inactivos_30' | 'mp_vinculado'

export interface UserDetail {
  user_id: string
  email: string | null
  name: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  providers: string[]
  last_activity_at: string
  days_inactive: number
  onboarded: boolean
  counts: {
    movements_total: number
    movements_30d: number
    accounts: number
    ai_calls_30d: number
    push_devices: number
  }
  daily: Array<{ day: string; movements: number; ai_calls: number }>
  ai_by_feature_30d: Array<{ feature: string; calls: number }>
  plus: {
    entitlement: { source: string; granted_at: string; expires_at: string; active: boolean } | null
    promo_redemptions: number
    subscriptions: Array<{
      status: string
      created_at: string
      updated_at: string
      preapproval_id: string | null
    }>
    payments: Array<{ payment_id: string; amount: number; created_at: string }>
  }
  mp: {
    status: string
    connected_at: string
    import_since: string
    last_sync_at: string | null
    last_sync_status: string | null
    last_error_class: string | null
    consecutive_failures: number
    imported_30d: number
    needs_review: number
    poison_rows: number
  } | null
  /** Suspension and support state (admin_usuario_estado). */
  estado: UserEstado
}

export interface UserEstado {
  suspended: boolean
  suspension: { reason: string; suspended_by: string; suspended_at: string } | null
  tickets_total: number
  tickets_open: number
}

export interface PlusOverview {
  entitlements: {
    active: number
    expired: number
    active_mercadopago: number
    active_promo: number
    expiring_7d: number
  }
  subscriptions: { pending: number; authorized: number; paused: number; cancelled: number }
  revenue: {
    currency: 'ARS'
    last_30d: number
    payments_30d: number
    total: number
    daily: Array<{ day: string; amount: number }>
  }
  recent_payments: Array<{
    payment_id: string
    user_id: string
    email: string | null
    amount: number
    created_at: string
  }>
  not_credited: Array<{
    user_id: string
    email: string | null
    subscription_created_at: string
  }>
}

export interface AiOverview {
  cost_tracked: boolean
  calls_today: number
  calls_month: number
  daily: Array<{ day: string; calls: number }>
  by_feature_30d: Array<{ feature: string; calls: number }>
  top_users_month: Array<{ user_id: string; email: string | null; calls: number }>
}

export interface MpOverview {
  connections: { active: number; needs_reconnect: number; plus_lapsed: number; unlinked: number }
  last_sync: { ok: number; partial: number; error: number; never: number; stale_over_1h: number }
  errors_by_class: Array<{ class: string; connections: number }>
  with_problems: Array<{
    user_id: string
    email: string | null
    status: string
    last_sync_at: string | null
    last_sync_status: string | null
    last_error_class: string | null
    consecutive_failures: number
  }>
  imports: { posted_30d: number; needs_review: number; voided_30d: number; poison_rows: number }
  cron: {
    last_run_at: string | null
    last_status: string | null
    runs_24h: number
    failures_24h: number
  } | null
}

export interface SystemOverview {
  db_size_bytes: number
  latest_migration: string | null
  cron: Array<{
    jobid: number
    name: string | null
    schedule: string
    active: boolean
    last_run_at: string | null
    last_status: string | null
    runs_24h: number
    failures_24h: number
  }> | null
  net_responses_24h: {
    total_24h: number
    ok_2xx: number
    redirect_3xx: number
    client_4xx: number
    server_5xx: number
    no_response: number
  } | null
  storage: { objects: number; bytes: number } | null
  push: { devices: number; users: number; messages_30d: number; last_message_at: string | null }
  admin_actions_24h: number
  generated_at: string
}

export interface PushResult {
  recipients: number
  sent: number
  failed: number
  removed: number
}

export type AccessDeniedReason = 'no_email' | 'email_not_confirmed' | 'not_allowed'

export interface PlusExpiringRow {
  user_id: string
  email: string | null
  source: string
  expires_at: string
  days_left: number
  subscription_status: string | null
  push_devices: number
  /** Days-left levels already notified for this expiry (3, 1, or the day an admin notified). */
  notified_levels: number[]
}

export interface PlusExpiring {
  days: number
  /** Plus ending soon that renews by itself (authorized subscription): not listed, not notified. */
  auto_renewing_excluded: number
  rows: PlusExpiringRow[]
}

export interface AvisosState {
  nightly_push_enabled: boolean
  plus_expiry_push_enabled: boolean
  /** The cron secret is stored: without it the scheduled pushes do nothing. */
  cron_configured: boolean
  nightly_last_sent_at: string | null
  nightly_last_sent_count: number | null
  plus_notices_30d: number
}

export type SettingKey = 'nightly_push_enabled' | 'plus_expiry_push_enabled'

export type SupportFilter = 'open' | 'resolved' | 'todas'

export interface SupportRow {
  o_total: number
  o_id: string
  o_user_id: string
  o_email: string | null
  o_subject: string
  o_status: 'open' | 'resolved'
  o_created_at: string
  o_replied_at: string | null
}

export interface SupportInbox {
  rows: SupportRow[]
  total: number
}

export interface SupportTicketDetail {
  id: string
  user_id: string
  email: string | null
  name: string | null
  subject: string
  message: string
  status: 'open' | 'resolved'
  reply: string | null
  replied_at: string | null
  replied_by: string | null
  resolved_at: string | null
  created_at: string
  user_tickets_total: number
}

export interface SupportReplyResult {
  replied: boolean
  push: PushResult
}
