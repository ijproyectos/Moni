// Pure logic for the push-send Edge Function: secret check, payload validation, bounded-concurrency fan-out.
// Web-standard APIs only (no Deno imports) so Vitest runs the tests from the Node project.

export const PUSH_KINDS = ['maintenance', 'feedback', 'news'] as const
export type PushKind = (typeof PUSH_KINDS)[number]

export const TITLE_MAX = 80
export const BODY_MAX = 240
export const URL_MAX = 200
export const TTL_SECONDS = 24 * 60 * 60
export const SEND_CONCURRENCY = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PushRequest {
  kind: PushKind
  title: string
  body: string
  url: string | null
  audience: 'all' | 'user'
  userId: string | null
  dryRun: boolean
}

export type ParseResult = { ok: true; value: PushRequest } | { ok: false; reason: string }

export interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** What the notification carries to the service worker (push-sw.js). */
export interface NotificationPayload {
  title: string
  body: string
  url: string | null
  kind: PushKind
}

export interface SendOutcome {
  sent: number
  failed: number
  /** Subscription ids whose endpoint answered 404 / 410 and must be deleted. */
  removedIds: string[]
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

/** Constant-time comparison (digests of equal length). Missing or empty values never match. */
export async function verifyPushSecret(
  header: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (!header || !expected) return false
  const [a, b] = await Promise.all([sha256(header), sha256(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 1)
  return diff === 0
}

/** An in-app path: starts with a single '/', no scheme, no protocol-relative form, no control characters. */
export function isRelativePath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return false
  if (value.length > URL_MAX) return false
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f\\]/.test(value)
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > max) return null
  return trimmed
}

export function parsePushRequest(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'invalid_body' }
  }
  const raw = input as Record<string, unknown>

  if (typeof raw.kind !== 'string' || !(PUSH_KINDS as readonly string[]).includes(raw.kind)) {
    return { ok: false, reason: 'invalid_kind' }
  }
  const title = cleanText(raw.title, TITLE_MAX)
  if (title === null) return { ok: false, reason: 'invalid_title' }
  const body = cleanText(raw.body, BODY_MAX)
  if (body === null) return { ok: false, reason: 'invalid_body_text' }

  let url: string | null = null
  if (raw.url !== undefined && raw.url !== null) {
    if (typeof raw.url !== 'string' || !isRelativePath(raw.url))
      return { ok: false, reason: 'invalid_url' }
    url = raw.url
  }

  const audience = raw.audience
  if (audience !== 'all' && audience !== 'user') return { ok: false, reason: 'invalid_audience' }
  let userId: string | null = null
  if (audience === 'user') {
    if (typeof raw.user_id !== 'string' || !UUID.test(raw.user_id))
      return { ok: false, reason: 'invalid_user_id' }
    userId = raw.user_id
  } else if (raw.user_id !== undefined && raw.user_id !== null) {
    return { ok: false, reason: 'invalid_user_id' }
  }

  if (raw.dry_run !== undefined && typeof raw.dry_run !== 'boolean')
    return { ok: false, reason: 'invalid_dry_run' }

  return {
    ok: true,
    value: {
      kind: raw.kind as PushKind,
      title,
      body,
      url,
      audience,
      userId,
      dryRun: raw.dry_run === true,
    },
  }
}

export function buildPayload(request: PushRequest): NotificationPayload {
  return { title: request.title, body: request.body, url: request.url, kind: request.kind }
}

/** web-push errors carry the HTTP status of the push service in `statusCode`. */
export function isGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { statusCode?: unknown }).statusCode
  return status === 404 || status === 410
}

/**
 * Sends to every subscription with at most `concurrency` in flight. `send` resolves on success and rejects on
 * failure. 404 / 410 mark the subscription for removal (and count as removed, not failed); anything else counts
 * as failed. Never touches or logs endpoints or keys.
 */
export async function sendToAll(
  subscriptions: readonly PushSubscriptionRow[],
  send: (subscription: PushSubscriptionRow) => Promise<unknown>,
  concurrency: number = SEND_CONCURRENCY,
): Promise<SendOutcome> {
  const outcome: SendOutcome = { sent: 0, failed: 0, removedIds: [] }
  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++
      const subscription = subscriptions[index]
      if (!subscription) return
      try {
        await send(subscription)
        outcome.sent++
      } catch (error) {
        if (isGone(error)) outcome.removedIds.push(subscription.id)
        else outcome.failed++
      }
    }
  }
  const workers = Math.max(1, Math.min(concurrency, subscriptions.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return outcome
}
