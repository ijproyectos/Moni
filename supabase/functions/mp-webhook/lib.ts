// Pure logic of the mp-webhook Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// Signature validation follows the Mercado Pago plugin's mp-webhooks skill: HMAC-SHA256 (hex) over
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// keyed with the application's webhook secret, compared with the `v1` part of the `x-signature` header.

import { matchesOffer } from '../_shared/plusOffer.ts'
import { statusFromMp, type SubscriptionStatus } from '../plus-subscription/lib.ts'

// ---------------------------------------------------------------------------------------------------------
// Topics (names taken from the guides/webhooks.md table and the mp-webhooks skill of the plugin)

export const TOPIC_PREAPPROVAL = 'subscription_preapproval'
export const TOPIC_AUTHORIZED_PAYMENT = 'subscription_authorized_payment'

export type SupportedTopic = typeof TOPIC_PREAPPROVAL | typeof TOPIC_AUTHORIZED_PAYMENT

export function supportedTopic(type: unknown): SupportedTopic | null {
  return type === TOPIC_PREAPPROVAL || type === TOPIC_AUTHORIZED_PAYMENT ? type : null
}

export function preapprovalResourceUrl(id: string): string {
  return `https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`
}

export function authorizedPaymentResourceUrl(id: string): string {
  return `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`
}

// ---------------------------------------------------------------------------------------------------------
// Notification body

export const MAX_BODY_BYTES = 8 * 1024

/** Ids are placed in a URL path: only this alphabet is accepted. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value)
}

export interface Notification {
  type: string | null
  dataId: string | null
}

/** Reads `type` and `data.id` from a notification body. The body is untrusted: it only names WHAT to re-fetch. */
export function parseNotification(body: unknown): Notification {
  if (typeof body !== 'object' || body === null) return { type: null, dataId: null }
  const { type, data } = body as { type?: unknown; data?: unknown }
  let dataId: string | null = null
  if (typeof data === 'object' && data !== null) {
    const id = (data as { id?: unknown }).id
    if (typeof id === 'string' && id !== '') dataId = id
    else if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) dataId = String(id)
  }
  return { type: typeof type === 'string' ? type : null, dataId }
}

// ---------------------------------------------------------------------------------------------------------
// Signature

/**
 * Maximum AGE accepted for the signed `ts`: 24 hours. Mercado Pago retries failed deliveries with exponential
 * backoff for up to about 24 hours (mp-webhooks skill) and it is NOT verified whether a retry is re-signed with a
 * fresh `ts`; a narrower window could reject the retry of a paid subscription and leave the user without Plus.
 * A replay inside the window is harmless: processing is idempotent (plus_payments.payment_id) and the resource is
 * always re-fetched from the Mercado Pago API with our own token, so the body is never trusted.
 */
export const TIMESTAMP_TOLERANCE_MS = 24 * 60 * 60 * 1000

/** A `ts` in the future is only forgiven up to this much clock skew (5 minutes). */
export const TIMESTAMP_FUTURE_SKEW_MS = 5 * 60 * 1000

export interface ParsedSignature {
  ts: string
  v1: string
}

/** Parses `ts=<digits>,v1=<64 hex chars>`. Returns null for anything else. */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header || header.length > 512) return null
  const parts: Record<string, string> = {}
  for (const piece of header.split(',')) {
    const index = piece.indexOf('=')
    if (index <= 0) continue
    parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim()
  }
  const { ts, v1 } = parts
  if (!ts || !v1) return null
  if (!/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return null
  return { ts, v1: v1.toLowerCase() }
}

export function buildManifest(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`
}

export async function computeSignature(secret: string, manifest: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(manifest)))
  return Array.from(signature, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison of two strings (the length of a hex digest is not secret). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** `ts` is milliseconds since the epoch in Mercado Pago examples; a value under 1e12 is read as seconds. */
export function isFreshTimestamp(
  ts: string,
  nowMs: number,
  toleranceMs: number = TIMESTAMP_TOLERANCE_MS,
  futureSkewMs: number = TIMESTAMP_FUTURE_SKEW_MS,
): boolean {
  const raw = Number(ts)
  if (!Number.isFinite(raw) || raw <= 0) return false
  const ms = raw < 1e12 ? raw * 1000 : raw
  const age = nowMs - ms
  return age <= toleranceMs && age >= -futureSkewMs
}

// ---------------------------------------------------------------------------------------------------------
// Duplicate subscriptions (defense in depth against double billing)

export interface AuthorizedRowRef {
  id: string
  preapproval_id: string | null
  created_at: string
}

export interface DuplicatePlan {
  /** The subject is newer than another authorized subscription of the same user: it is the duplicate. */
  cancelSubject: boolean
  /** Authorized rows of the same user that are newer than the subject (only when the subject is not a duplicate). */
  cancelOthers: AuthorizedRowRef[]
}

function isOlder(a: { id: string; created_at: string }, b: { id: string; created_at: string }) {
  const delta = Date.parse(a.created_at) - Date.parse(b.created_at)
  return delta !== 0 ? delta < 0 : a.id < b.id
}

/**
 * Keeps the OLDEST authorized subscription of a user (the one that was authorized first by checkout order) and
 * marks every newer one as a duplicate. `authorizedRows` are the user's rows currently `authorized` in the database;
 * the subject (the subscription the notification is about) may or may not be among them.
 */
export function planDuplicates(
  subject: { id: string; created_at: string },
  authorizedRows: readonly AuthorizedRowRef[],
): DuplicatePlan {
  const others = authorizedRows.filter((r) => r.id !== subject.id)
  if (others.some((r) => isOlder(r, subject))) return { cancelSubject: true, cancelOthers: [] }
  return { cancelSubject: false, cancelOthers: others.filter((r) => isOlder(subject, r)) }
}

export type SignatureResult =
  | { ok: true; dataId: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' }

export interface VerifyInput {
  secret: string
  signatureHeader: string | null
  requestId: string | null
  /** Candidate `data.id` values (body, query string). The one whose manifest matches the signature wins. */
  dataIds: readonly (string | null)[]
  nowMs: number
}

/** Verifies x-signature. Does no I/O and touches nothing but its input. */
export async function verifyWebhookSignature(input: VerifyInput): Promise<SignatureResult> {
  const candidates = [...new Set(input.dataIds.filter((id): id is string => !!id))]
  if (!input.signatureHeader || !input.requestId || candidates.length === 0) {
    return { ok: false, reason: 'missing' }
  }
  const parsed = parseSignatureHeader(input.signatureHeader)
  if (!parsed) return { ok: false, reason: 'malformed' }
  if (!isFreshTimestamp(parsed.ts, input.nowMs)) return { ok: false, reason: 'stale' }
  for (const dataId of candidates) {
    const expected = await computeSignature(
      input.secret,
      buildManifest(dataId, input.requestId, parsed.ts),
    )
    if (timingSafeEqualStrings(expected, parsed.v1)) return { ok: true, dataId }
  }
  return { ok: false, reason: 'mismatch' }
}

// ---------------------------------------------------------------------------------------------------------
// Resources re-fetched from Mercado Pago

export interface PreapprovalInfo {
  id: string
  status: SubscriptionStatus | null
  externalReference: string | null
  /** null when Mercado Pago did not include auto_recurring. */
  matchesOffer: boolean | null
}

export function parsePreapprovalResource(json: unknown): PreapprovalInfo | null {
  if (typeof json !== 'object' || json === null) return null
  const { id, status, external_reference, auto_recurring } = json as Record<string, unknown>
  if (typeof id !== 'string' || id === '') return null
  let offerMatch: boolean | null = null
  if (typeof auto_recurring === 'object' && auto_recurring !== null) {
    const { transaction_amount, currency_id } = auto_recurring as Record<string, unknown>
    offerMatch = matchesOffer(transaction_amount, currency_id)
  }
  return {
    id,
    status: statusFromMp(status),
    externalReference: typeof external_reference === 'string' ? external_reference : null,
    matchesOffer: offerMatch,
  }
}

export interface AuthorizedPaymentInfo {
  preapprovalId: string | null
  amount: unknown
  currency: unknown
  paymentId: string | null
  paymentStatus: string | null
}

/**
 * Reads an authorized payment (GET /authorized_payments/{id}). NOTE: the exact response schema is NOT documented in
 * the sources available when this was written; the fields below (preapproval_id, transaction_amount, currency_id,
 * payment.id, payment.status) are the expected ones and must be confirmed against a real test-user payment. Anything
 * that does not fit is surfaced as `unexpected_shape` instead of being guessed.
 */
export function parseAuthorizedPayment(json: unknown): AuthorizedPaymentInfo | null {
  if (typeof json !== 'object' || json === null) return null
  const { preapproval_id, transaction_amount, currency_id, payment } = json as Record<
    string,
    unknown
  >
  let paymentId: string | null = null
  let paymentStatus: string | null = null
  if (typeof payment === 'object' && payment !== null) {
    const { id, status } = payment as Record<string, unknown>
    if (typeof id === 'string' && id !== '') paymentId = id
    else if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) paymentId = String(id)
    if (typeof status === 'string') paymentStatus = status
  }
  return {
    preapprovalId:
      typeof preapproval_id === 'string' && preapproval_id !== '' ? preapproval_id : null,
    amount: transaction_amount,
    currency: currency_id,
    paymentId,
    paymentStatus,
  }
}

export type PaymentDecision =
  | { kind: 'grant'; preapprovalId: string; paymentId: string; amount: number }
  | { kind: 'ignore'; reason: 'not_approved' | 'amount_mismatch' }
  | { kind: 'unexpected_shape' }

/** Decides whether an authorized payment earns one month of Plus. Pure: the caller does the database work. */
export function decidePayment(info: AuthorizedPaymentInfo): PaymentDecision {
  if (info.paymentStatus !== 'approved') return { kind: 'ignore', reason: 'not_approved' }
  if (
    !info.preapprovalId ||
    !info.paymentId ||
    typeof info.amount !== 'number' ||
    typeof info.currency !== 'string'
  ) {
    return { kind: 'unexpected_shape' }
  }
  if (!matchesOffer(info.amount, info.currency)) {
    return { kind: 'ignore', reason: 'amount_mismatch' }
  }
  return {
    kind: 'grant',
    preapprovalId: info.preapprovalId,
    paymentId: info.paymentId,
    amount: info.amount,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Error classification

export type MpFetchClass = 'ok' | 'transient' | 'config' | 'permanent'

/**
 * Classifies the HTTP status of a re-fetch (0 = network error / timeout). 404 counts as transient because the
 * notification can outrun the resource; 401/403 means our access token is wrong.
 */
export function classifyMpFetch(status: number): MpFetchClass {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 0 || status === 404 || status === 408 || status === 429 || status >= 500) {
    return 'transient'
  }
  if (status === 401 || status === 403) return 'config'
  return 'permanent'
}

/** HTTP status returned to Mercado Pago: 2xx stops retries, 5xx makes it retry. */
export function httpStatusFor(kind: 'handled' | 'ignored' | 'transient' | 'config'): number {
  switch (kind) {
    case 'handled':
    case 'ignored':
      return 200
    case 'transient':
      return 503
    case 'config':
      return 500
  }
}
