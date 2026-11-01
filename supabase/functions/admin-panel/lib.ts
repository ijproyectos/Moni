// Pure logic for the admin-panel Edge Function: allowlist parsing, the access decision, request validation and the
// push rate limit. Web-standard APIs only (no Deno imports) so Vitest runs the tests from the Node project.
//
// Security model (enforced by index.ts, decided here):
//   * identity comes ONLY from the user the JWT resolves to (auth.getUser), never from the request body;
//   * the caller needs a confirmed email or a verified Google identity AND an email in ADMIN_EMAILS;
//   * an unset or empty ADMIN_EMAILS means nobody is an admin.

import { parsePushRequest, type PushRequest } from '../push-send/lib.ts'

export const SECTIONS = ['resumen', 'usuarios', 'usuario', 'plus', 'ia', 'mp', 'sistema'] as const
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

export const PUSH_ACTION = 'push_user'
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
  | { kind: 'section'; section: 'resumen' | 'plus' | 'ia' | 'mp' | 'sistema' }
  | {
      kind: 'section'
      section: 'usuarios'
      search: string
      filter: UserFilter
      limit: number
      offset: number
    }
  | { kind: 'section'; section: 'usuario'; userId: string }
  | { kind: 'push'; push: PushRequest }

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

  return {
    ok: true,
    value: { kind: 'section', section: section as 'resumen' | 'plus' | 'ia' | 'mp' | 'sistema' },
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
  return request.kind === 'push' ? 'push_user' : request.section
}
