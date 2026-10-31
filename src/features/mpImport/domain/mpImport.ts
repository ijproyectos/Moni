// Mercado Pago expense auto-import (Plus): the pure rules the UI needs. The server decides everything that matters
// (Plus gate, consent version, rate limits); nothing here is trusted by the backend.

import { isMercadoPagoUrl } from '@/features/plus/domain/billing'
import { toCents, type Cents } from '@/shared/lib/money'

/** Must equal MP_CONSENT_VERSION in supabase/functions/mp-oauth/lib.ts; a mismatch makes the server answer consent_required. */
export const MP_CONSENT_VERSION = 'mp-import-v1'

export type ImportWindow = 'now' | '30' | '90'

/** "From now" is the default (design D19): nothing from the past is imported unless the person asks. */
export const DEFAULT_IMPORT_WINDOW: ImportWindow = 'now'

export const IMPORT_WINDOWS: readonly { value: ImportWindow; label: string }[] = [
  { value: 'now', label: 'Desde ahora' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
]

/** Consent text (R1.2). Keep it in sync with MP_CONSENT_VERSION: changing the meaning requires a new version. */
export const CONSENT_POINTS = [
  'Vos decidís sobre tus datos: Moni los usa solo para cargar tus gastos de Mercado Pago.',
  'Para elegir la categoría, Moni le envía a la Claude API (la IA de Anthropic) solo el texto del comercio de cada compra. No se envían montos ni datos de tu cuenta, y el texto de las transferencias no se envía nunca: se cargan con una categoría general.',
  'Moni guarda lo mínimo: id del pago, monto, fecha, el texto del comercio o concepto y estado.',
  'Nunca guardamos tu usuario ni tu contraseña de Mercado Pago. Podés desvincular cuando quieras y tus movimientos se mantienen.',
] as const

/** localStorage key (same origin) where the app leaves the API base for public/mp/callback.html. */
export const MP_API_BASE_KEY = 'moni.mp.apiBase'
/** sessionStorage key where the callback page parks code/state when its stored token has expired. */
export const MP_PENDING_KEY = 'moni.mp.pending'
const PENDING_MAX_AGE_MS = 10 * 60 * 1000
const MAX_PARAM_CHARS = 500

/** The origin of an https URL (http only for localhost, for development); anything else is null. Mirrors callback.html. */
export function safeApiBase(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/** Reads the pair parked by callback.html. Stale (10 min), future-dated or malformed values are null. */
export function parsePendingLink(raw: string | null, nowMs: number): { code: string; state: string } | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { code?: unknown; state?: unknown; at?: unknown } | null
    if (!v || typeof v.code !== 'string' || typeof v.state !== 'string' || typeof v.at !== 'number') return null
    if (v.code === '' || v.state === '' || v.code.length > MAX_PARAM_CHARS || v.state.length > MAX_PARAM_CHARS) return null
    const age = nowMs - v.at
    if (age < 0 || age > PENDING_MAX_AGE_MS) return null
    return { code: v.code, state: v.state }
  } catch {
    return null
  }
}

export type MpConnectionStatus = 'active' | 'needs_reconnect' | 'plus_lapsed' | 'unlinked'

const STATUSES: readonly string[] = ['active', 'needs_reconnect', 'plus_lapsed', 'unlinked']

export interface MpConnection {
  status: MpConnectionStatus
  lastSyncAt: string | null
  lastErrorClass: string | null
  importSince: string
}

/** Reads the `get_my_mp_connection()` rows. No row (never linked) or an unexpected shape is null. */
export function parseConnection(data: unknown): MpConnection | null {
  if (!Array.isArray(data) || data.length === 0) return null
  const row = data[0] as Record<string, unknown> | null
  if (!row || typeof row.status !== 'string' || !STATUSES.includes(row.status)) return null
  return {
    status: row.status as MpConnectionStatus,
    lastSyncAt: typeof row.last_sync_at === 'string' ? row.last_sync_at : null,
    lastErrorClass: typeof row.last_error_class === 'string' ? row.last_error_class : null,
    importSince: typeof row.import_since === 'string' ? row.import_since : '',
  }
}

/** The authorize URL comes from our server, but it is re-validated before the browser leaves the app. */
export function isMpAuthorizeUrl(value: unknown): value is string {
  return isMercadoPagoUrl(value)
}

export interface CallbackFeedback {
  tone: 'success' | 'error'
  message: string
}

const CALLBACK_ERRORS: Record<string, string> = {
  denied: 'No diste permiso en Mercado Pago, así que no vinculamos la cuenta.',
  session_required: 'Abrí Moni en este mismo navegador, ingresá y volvé a vincular.',
  invalid_state: 'El enlace de vinculación venció o ya se usó. Probá de nuevo.',
  code_rejected: 'Mercado Pago no aceptó la autorización. Probá de nuevo.',
  mp_unavailable: 'Mercado Pago no responde en este momento. Probá de nuevo en un ratito.',
  mp_account_in_use: 'Esa cuenta de Mercado Pago ya está vinculada a otra cuenta de Moni.',
  network: 'Se cortó la conexión mientras vinculábamos. Probá de nuevo.',
}
const CALLBACK_FALLBACK = 'No pudimos vincular Mercado Pago. Probá de nuevo en un rato.'

/** Reads `?mp=ok` / `?mp=error&reason=...` left by public/mp/callback.html. Anything else is null. */
export function callbackFeedback(params: URLSearchParams): CallbackFeedback | null {
  const mp = params.get('mp')
  if (mp === 'ok') {
    return {
      tone: 'success',
      message: 'Mercado Pago vinculado. Tus gastos van a aparecer solos en unos minutos.',
    }
  }
  if (mp !== 'error') return null
  const reason = params.get('reason') ?? ''
  return { tone: 'error', message: CALLBACK_ERRORS[reason] ?? CALLBACK_FALLBACK }
}

const NOTICES: Record<string, string> = {
  rate_limited: 'Mercado Pago pidió bajar el ritmo. Reintentamos en la próxima actualización.',
  mp_unavailable: 'Mercado Pago no respondió en la última actualización. Reintentamos solos.',
  token_invalid: 'Hay que volver a vincular tu cuenta de Mercado Pago.',
  account_unavailable:
    'No encontramos el medio de pago "Mercado Pago". Revisá que no esté eliminado.',
  category_unavailable: 'Faltan categorías de gasto para clasificar tus pagos.',
  config: 'La importación no está disponible por ahora.',
  unexpected: 'La última actualización falló. Reintentamos solos.',
}

/** Text for the last sync error class, or null when the last run was fine. */
export function connectionNotice(errorClass: string | null): string | null {
  if (!errorClass) return null
  return NOTICES[errorClass] ?? NOTICES.unexpected ?? null
}

/** Payments quarantined after repeated import failures (needs_review without a movement), see the poison-row policy. */
export function unimportedNotice(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null
  return count === 1
    ? 'No pudimos cargar 1 pago de Mercado Pago. Podés agregarlo a mano en tus movimientos.'
    : `No pudimos cargar ${count} pagos de Mercado Pago. Podés agregarlos a mano en tus movimientos.`
}

export interface MpDuplicate {
  paymentId: string
  occurredOn: string
  duplicateOccurredOn: string
  cents: Cents
}

/** Reads `get_mp_import_duplicates()`; rows that do not look right are dropped, never guessed. */
export function parseDuplicates(data: unknown): MpDuplicate[] {
  if (!Array.isArray(data)) return []
  const out: MpDuplicate[] = []
  for (const raw of data) {
    const r = raw as Record<string, unknown> | null
    if (
      !r ||
      typeof r.payment_id !== 'string' ||
      typeof r.occurred_on !== 'string' ||
      typeof r.duplicate_occurred_on !== 'string' ||
      (typeof r.amount !== 'number' && typeof r.amount !== 'string')
    ) {
      continue
    }
    out.push({
      paymentId: r.payment_id,
      occurredOn: r.occurred_on,
      duplicateOccurredOn: r.duplicate_occurred_on,
      cents: toCents(r.amount),
    })
  }
  return out
}

export interface MpSubscriptionSuggestion {
  paymentId: string
  merchant: string | null
  occurredOn: string
  cents: Cents
  subscriptionName: string | null
}

const AR_TZ = 'America/Argentina/Buenos_Aires'

/** "02/11 10:00" in Argentina time, or null when there was no sync yet (or the date is unreadable). */
export function formatLastSync(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? '').padStart(2, '0')
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
}
