// The ONLY place where Mercado Pago payment field names, query parameters and error codes are assumed.
//
// UNVERIFIED against live MP (task 0.2): every constant and field path below comes from docs and research, not
// from a captured response. When WU0 records the real behaviour (payer.id, collector.id, operation_type,
// point_of_interaction.type, paging shape, `range=date_last_updated` semantics, error codes), adjust ONLY this file.

import { MpApiError } from '../_shared/mpApi.ts'

// UNVERIFIED against live MP (task 0.2)
export const SEARCH_PATH = '/v1/payments/search'
/** UNVERIFIED against live MP (task 0.2): safe page size (V6). */
export const PAGE_SIZE = 50
/** UNVERIFIED against live MP (task 0.2): `range=date_last_updated` may not surface refunds (V7/V8, D9b). */
export const RANGE_FIELD = 'date_last_updated'
/** UNVERIFIED against live MP (task 0.2): operation types that become expenses (D10). */
export const IMPORT_OPERATION_TYPES: readonly string[] = ['regular_payment', 'money_transfer']
/** UNVERIFIED against live MP (task 0.2): recurring feed only feeds the subscription check (D10). */
export const RECURRING_OPERATION_TYPES: readonly string[] = ['recurring_payment']
/** UNVERIFIED against live MP (task 0.2): point_of_interaction.type values that mark a subscription charge. */
export const RECURRING_POI_TYPES: readonly string[] = ['SUBSCRIPTIONS']
export const HOME_CURRENCY = 'ARS'
export const STATUS_APPROVED = 'approved'
/** UNVERIFIED against live MP (task 0.2): statuses that void an already imported payment. */
export const VOID_STATUSES: readonly string[] = ['refunded', 'charged_back', 'cancelled']
/** UNVERIFIED against live MP (task 0.2): error cause code "window too large / too many results" (D11). */
const WINDOW_TOO_LARGE_CODE = '1000'
/** UNVERIFIED against live MP (task 0.2): error cause code that means "skip this run" (D12). */
const SKIP_RUN_CODE = '2001'

export interface MpPayment {
  paymentId: string
  payerId: string
  collectorId: string
  currency: string
  status: string
  operationType: string
  poiType: string
  amount: number
  dateApproved: string | null
  dateCreated: string | null
  merchant: string
}

const MAX_MERCHANT_CHARS = 200

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function obj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function cleanMerchant(value: unknown): string {
  if (typeof value !== 'string') return ''
  return Array.from(value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, MAX_MERCHANT_CHARS)
    .join('')
}

/**
 * Whitelist mapper: only the fields sync needs leave this function (no payer email/name/document, no card data).
 * Returns null for rows that cannot be processed.
 */
export function normalizePayment(raw: unknown): MpPayment | null {
  const r = obj(raw)
  const paymentId = str(r.id)
  const amount = r.transaction_amount
  if (!paymentId || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null
  const merchant = cleanMerchant(r.description) || cleanMerchant(r.statement_descriptor)
  return {
    paymentId,
    payerId: str(obj(r.payer).id) ?? '',
    collectorId: str(obj(r.collector).id ?? r.collector_id) ?? '',
    currency: str(r.currency_id) ?? '',
    status: str(r.status) ?? '',
    operationType: str(r.operation_type) ?? '',
    poiType: str(obj(r.point_of_interaction).type) ?? '',
    amount,
    dateApproved: str(r.date_approved),
    dateCreated: str(r.date_created),
    merchant,
  }
}

export function classifyOperation(p: Pick<MpPayment, 'operationType' | 'poiType'>): 'import' | 'recurring' | 'other' {
  if (RECURRING_OPERATION_TYPES.includes(p.operationType) || RECURRING_POI_TYPES.includes(p.poiType)) {
    return 'recurring'
  }
  return IMPORT_OPERATION_TYPES.includes(p.operationType) ? 'import' : 'other'
}

/**
 * Only the merchant text of a PURCHASE may leave for the model. A money_transfer's description / statement descriptor
 * can carry a counterparty name or a free note typed by a person, so transfers never reach the categorizer: the
 * import RPC gives them the fallback category.
 */
export function sendsTextToModel(p: Pick<MpPayment, 'operationType'>): boolean {
  return p.operationType === 'regular_payment'
}

export function buildSearchQuery(beginIso: string, endIso: string, offset: number): Record<string, string> {
  return {
    sort: RANGE_FIELD,
    criteria: 'asc',
    range: RANGE_FIELD,
    begin_date: beginIso,
    end_date: endIso,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  }
}

/** UNVERIFIED against live MP (task 0.2): body is `{ results: [...], paging: { total } }`. */
export function parseSearchPage(body: unknown): { results: unknown[]; total: number | null } | null {
  const b = obj(body)
  if (!Array.isArray(b.results)) return null
  const total = obj(b.paging).total
  return { results: b.results, total: typeof total === 'number' && Number.isFinite(total) ? total : null }
}

export function isWindowTooLarge(error: unknown): boolean {
  return error instanceof MpApiError && error.mpCode === WINDOW_TOO_LARGE_CODE
}

export function isSkipRunError(error: unknown): boolean {
  return error instanceof MpApiError && error.mpCode === SKIP_RUN_CODE
}
