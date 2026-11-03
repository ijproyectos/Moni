// Pure logic for the admin-panel Edge Function: allowlist parsing, the access decision, request validation and the
// push rate limit. Web-standard APIs only (no Deno imports) so Vitest runs the tests from the Node project.
//
// Security model (enforced by index.ts, decided here):
//   * identity comes ONLY from the user the JWT resolves to (auth.getUser), never from the request body;
//   * the caller needs a confirmed email or a verified Google identity AND an email in ADMIN_EMAILS;
//   * an unset or empty ADMIN_EMAILS means nobody is an admin.

import { parsePushRequest, type PushRequest } from '../push-send/lib.ts'

export const SECTIONS = [
  'resumen',
  'usuarios',
  'usuario',
  'plus',
  'plus_vencen',
  'ia',
  'mp',
  'sistema',
  'avisos',
  'soporte',
  'soporte_ticket',
] as const
export type Section = (typeof SECTIONS)[number]

export const USER_FILTERS = [
  'todos',
  'plus',
  'inactivos_7',
  'inactivos_30',
  'mp_vinculado',
] as const
export type UserFilter = (typeof USER_FILTERS)[number]

export const SEARCH_MAX = 100
export const PAGE_MAX = 100
export const PAGE_DEFAULT = 25
export const OFFSET_MAX = 1_000_000

export const SUPPORT_FILTERS = ['open', 'resolved', 'todas'] as const
export type SupportFilter = (typeof SUPPORT_FILTERS)[number]

/** The only switches the panel can flip (mirrors public.admin_set_setting). */
export const SETTING_KEYS = ['nightly_push_enabled', 'plus_expiry_push_enabled'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

export const SUSPEND_REASON_MIN = 3
export const SUSPEND_REASON_MAX = 200
export const REPLY_MAX = 2000
export const EXPIRING_DAYS_DEFAULT = 7
export const EXPIRING_DAYS_MAX = 30

export const PUSH_ACTION = 'push_user'
export const PLUS_NOTIFY_ACTION = 'plus_notify'
export const PLUS_NOTIFY_LIMIT_PER_HOUR = 30
export const PUSH_LIMIT_PER_HOUR = 10
export const PUSH_WINDOW_MS = 60 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "A@x.com, b@y.com ,," -> ['a@x.com', 'b@y.com']. Empty / missing -> []. */
export function parseAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return []
  const emails = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '')
  return [...new Set(emails)]
}

export function isAllowedEmail(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return normalized !== '' && allowlist.includes(normalized)
}

/** The subset of the Supabase user the access decision reads. */
export interface AdminCandidate {
  email?: string | null
  email_confirmed_at?: string | null
  identities?: ReadonlyArray<{
    provider?: string
    identity_data?: Record<string, unknown> | null
  }> | null
}

export type AccessDecision =
  | { ok: true; email: string }
  | { ok: false; reason: 'no_email' | 'email_not_confirmed' | 'not_allowed' }

/** A Google identity whose email Google reports as verified and that matches the account email. */
export function hasVerifiedGoogleIdentity(user: AdminCandidate): boolean {
  const accountEmail = user.email?.trim().toLowerCase()
  if (!accountEmail) return false
  return (user.identities ?? []).some((identity) => {
    if (identity.provider !== 'google') return false
    const data = identity.identity_data
    if (!data || data.email_verified !== true) return false
    return typeof data.email === 'string' && data.email.trim().toLowerCase() === accountEmail
  })
}

export function decideAccess(user: AdminCandidate, allowlist: readonly string[]): AccessDecision {
  const email = user.email?.trim().toLowerCase()
  if (!email) return { ok: false, reason: 'no_email' }
  const confirmed = Boolean(user.email_confirmed_at) || hasVerifiedGoogleIdentity(user)
  if (!confirmed) return { ok: false, reason: 'email_not_confirmed' }
  if (!isAllowedEmail(email, allowlist)) return { ok: false, reason: 'not_allowed' }
  return { ok: true, email }
}

export type AdminRequest =
  | { kind: 'section'; section: 'resumen' | 'plus' | 'ia' | 'mp' | 'sistema' | 'avisos' }
  | {
      kind: 'section'
      section: 'usuarios'
      search: string
      filter: UserFilter
      limit: number
      offset: number
    }
  | { kind: 'section'; section: 'usuario'; userId: string }
  | { kind: 'section'; section: 'plus_vencen'; days: number }
  | { kind: 'section'; section: 'soporte'; status: SupportFilter; limit: number; offset: number }
  | { kind: 'section'; section: 'soporte_ticket'; ticketId: string }
  | { kind: 'push'; push: PushRequest }
  | { kind: 'suspend'; userId: string; reason: string; confirmEmail: string }
  | { kind: 'unsuspend'; userId: string }
  | { kind: 'plus_notify'; userId: string }
  | { kind: 'support_reply'; ticketId: string; reply: string; resolve: boolean }
  | { kind: 'support_status'; ticketId: string; status: 'open' | 'resolved' }
  | { kind: 'setting'; key: SettingKey; enabled: boolean }

export type ParseAdminResult = { ok: true; value: AdminRequest } | { ok: false; reason: string }

function clampInt(value: unknown, min: number, max: number, fallback: number): number | null {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return Math.max(min, Math.min(max, value))
}

/** Validates the body. Identity is never read from it. */
export function parseAdminRequest(input: unknown): ParseAdminResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'invalid_body' }
  }
  const raw = input as Record<string, unknown>

  if (raw.action === PUSH_ACTION) {
    if (typeof raw.user_id !== 'string' || !UUID.test(raw.user_id))
      return { ok: false, reason: 'invalid_user_id' }
    const parsed = parsePushRequest({
      kind: 'news',
      title: raw.title,
      body: raw.body,
      audience: 'user',
      user_id: raw.user_id,
    })
    if (!parsed.ok) return { ok: false, reason: parsed.reason }
    return { ok: true, value: { kind: 'push', push: parsed.value } }
  }

  const action = parseAction(raw)
  if (action) return action

  const section = raw.section
  if (typeof section !== 'string' || !(SECTIONS as readonly string[]).includes(section)) {
    return { ok: false, reason: 'invalid_section' }
  }

  if (section === 'usuarios') {
    let search = ''
    if (raw.search !== undefined && raw.search !== null) {
      if (typeof raw.search !== 'string' || raw.search.length > SEARCH_MAX)
        return { ok: false, reason: 'invalid_search' }
      search = raw.search.trim()
    }
    const filter = raw.filter ?? 'todos'
    if (typeof filter !== 'string' || !(USER_FILTERS as readonly string[]).includes(filter))
      return { ok: false, reason: 'invalid_filter' }
    const limit = clampInt(raw.limit, 1, PAGE_MAX, PAGE_DEFAULT)
    const offset = clampInt(raw.offset, 0, OFFSET_MAX, 0)
    if (limit === null || offset === null) return { ok: false, reason: 'invalid_page' }
    return {
      ok: true,
      value: { kind: 'section', section, search, filter: filter as UserFilter, limit, offset },
    }
  }

  if (section === 'usuario') {
    if (typeof raw.user_id !== 'string' || !UUID.test(raw.user_id))
      return { ok: false, reason: 'invalid_user_id' }
    return { ok: true, value: { kind: 'section', section, userId: raw.user_id } }
  }

  if (section === 'plus_vencen') {
    const days = clampInt(raw.days, 1, EXPIRING_DAYS_MAX, EXPIRING_DAYS_DEFAULT)
    if (days === null) return { ok: false, reason: 'invalid_days' }
    return { ok: true, value: { kind: 'section', section, days } }
  }

  if (section === 'soporte') {
    const status = raw.status ?? 'open'
    if (typeof status !== 'string' || !(SUPPORT_FILTERS as readonly string[]).includes(status))
      return { ok: false, reason: 'invalid_status' }
    const limit = clampInt(raw.limit, 1, PAGE_MAX, PAGE_DEFAULT)
    const offset = clampInt(raw.offset, 0, OFFSET_MAX, 0)
    if (limit === null || offset === null) return { ok: false, reason: 'invalid_page' }
    return {
      ok: true,
      value: { kind: 'section', section, status: status as SupportFilter, limit, offset },
    }
  }

  if (section === 'soporte_ticket') {
    if (typeof raw.ticket_id !== 'string' || !UUID.test(raw.ticket_id))
      return { ok: false, reason: 'invalid_ticket_id' }
    return { ok: true, value: { kind: 'section', section, ticketId: raw.ticket_id } }
  }

  return {
    ok: true,
    value: {
      kind: 'section',
      section: section as 'resumen' | 'plus' | 'ia' | 'mp' | 'sistema' | 'avisos',
    },
  }
}

function parseAction(raw: Record<string, unknown>): ParseAdminResult | null {
  const action = raw.action
  if (typeof action !== 'string' || action === PUSH_ACTION) return null

  if (action === 'suspend_user') {
    if (typeof raw.user_id !== 'string' || !UUID.test(raw.user_id))
      return { ok: false, reason: 'invalid_user_id' }
    const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
    if (reason.length < SUSPEND_REASON_MIN || reason.length > SUSPEND_REASON_MAX)
      return { ok: false, reason: 'invalid_reason' }
    if (typeof raw.confirm_email !== 'string' || raw.confirm_email.trim() === '')
      return { ok: false, reason: 'invalid_confirmation' }
    return {
      ok: true,
      value: {
        kind: 'suspend',
        userId: raw.user_id,
        reason,
        confirmEmail: raw.confirm_email.trim().toLowerCase(),
      },
    }
  }

  if (action === 'unsuspend_user' || action === PLUS_NOTIFY_ACTION) {
    if (typeof raw.user_id !== 'string' || !UUID.test(raw.user_id))
      return { ok: false, reason: 'invalid_user_id' }
    return {
      ok: true,
      value:
        action === 'unsuspend_user'
          ? { kind: 'unsuspend', userId: raw.user_id }
          : { kind: 'plus_notify', userId: raw.user_id },
    }
  }

  if (action === 'support_reply') {
    if (typeof raw.ticket_id !== 'string' || !UUID.test(raw.ticket_id))
      return { ok: false, reason: 'invalid_ticket_id' }
    const reply = typeof raw.reply === 'string' ? raw.reply.trim() : ''
    if (reply === '' || reply.length > REPLY_MAX) return { ok: false, reason: 'invalid_reply' }
    if (raw.resolve !== undefined && typeof raw.resolve !== 'boolean')
      return { ok: false, reason: 'invalid_resolve' }
    return {
      ok: true,
      value: {
        kind: 'support_reply',
        ticketId: raw.ticket_id,
        reply,
        resolve: raw.resolve === true,
      },
    }
  }

  if (action === 'support_status') {
    if (typeof raw.ticket_id !== 'string' || !UUID.test(raw.ticket_id))
      return { ok: false, reason: 'invalid_ticket_id' }
    if (raw.status !== 'open' && raw.status !== 'resolved')
      return { ok: false, reason: 'invalid_status' }
    return {
      ok: true,
      value: { kind: 'support_status', ticketId: raw.ticket_id, status: raw.status },
    }
  }

  if (action === 'setting_set') {
    if (typeof raw.key !== 'string' || !(SETTING_KEYS as readonly string[]).includes(raw.key))
      return { ok: false, reason: 'invalid_setting' }
    if (typeof raw.enabled !== 'boolean') return { ok: false, reason: 'invalid_value' }
    return {
      ok: true,
      value: { kind: 'setting', key: raw.key as SettingKey, enabled: raw.enabled },
    }
  }

  return { ok: false, reason: 'invalid_action' }
}

export type SuspensionDecision =
  | { ok: true }
  | {
      ok: false
      reason:
        'no_target_email' | 'cannot_suspend_self' | 'cannot_suspend_admin' | 'confirmation_mismatch'
    }

/**
 * Who may be suspended: never the admin who asks, never anyone on the admin allowlist, and only when the admin typed
 * the target's email exactly (a guard against suspending the wrong row).
 */
export function decideSuspension(input: {
  adminEmail: string
  targetEmail: string | null | undefined
  confirmEmail: string
  allowlist: readonly string[]
}): SuspensionDecision {
  const target = input.targetEmail?.trim().toLowerCase()
  if (!target) return { ok: false, reason: 'no_target_email' }
  if (target === input.adminEmail.trim().toLowerCase())
    return { ok: false, reason: 'cannot_suspend_self' }
  if (isAllowedEmail(target, input.allowlist)) return { ok: false, reason: 'cannot_suspend_admin' }
  if (input.confirmEmail.trim().toLowerCase() !== target)
    return { ok: false, reason: 'confirmation_mismatch' }
  return { ok: true }
}

/** The push a person gets when the team answers their ticket. The answer itself is never put in a notification. */
export function supportReplyPush(userId: string): PushRequest {
  return {
    kind: 'support',
    title: 'Moni Soporte',
    body: 'Respondimos tu consulta. Tocá para verla.',
    url: '/soporte',
    audience: 'user',
    userId,
    dryRun: false,
  }
}

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  /** Seconds until the oldest action in the window expires (0 when allowed). */
  retryAfterSeconds: number
}

/**
 * Sliding-window limit: at most `max` actions per `windowMs`. `timestamps` are the times of this admin's previous
 * actions (ISO strings or Dates); anything older than the window is ignored.
 */
export function decidePushRateLimit(
  timestamps: ReadonlyArray<string | Date>,
  now: Date,
  max: number = PUSH_LIMIT_PER_HOUR,
  windowMs: number = PUSH_WINDOW_MS,
): RateLimitDecision {
  const cutoff = now.getTime() - windowMs
  const recent = timestamps
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && t > cutoff)
    .sort((a, b) => a - b)
  if (recent.length < max)
    return { allowed: true, remaining: max - recent.length, retryAfterSeconds: 0 }
  const oldest = recent[recent.length - max] ?? recent[0] ?? now.getTime()
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000)),
  }
}

/** The section recorded in admin_accesos for a request. */
export function auditSection(request: AdminRequest): string {
  if (request.kind === 'section') return request.section
  return {
    push: 'push_user',
    suspend: 'suspend_user',
    unsuspend: 'unsuspend_user',
    plus_notify: 'plus_notify',
    support_reply: 'support_reply',
    support_status: 'support_status',
    setting: 'setting_set',
  }[request.kind]
}
