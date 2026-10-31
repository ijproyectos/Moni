// Pure logic of the mp-connect-webhook Edge Function (no Deno / npm imports, so Vitest runs it from Node).
//
// Receives Mercado Pago `mp-connect` notifications (OAuth link / unlink). The only action handled is a
// deauthorization: the matching connection becomes `unlinked`, with the same semantics as the mp-oauth `unlink`
// action (tokens and key_version nulled, imported transactions kept).
//
// Order of work (design D17): flag -> signature -> parse -> store. While MP_CONNECT_WEBHOOK_ENABLED is not exactly
// 'true' the function answers 200 `{ignored:'disabled'}` and does nothing else.

import { isSafeId, isFreshTimestamp, parseSignatureHeader, computeSignature, timingSafeEqualStrings, MAX_BODY_BYTES } from '../mp-webhook/lib.ts'

export { MAX_BODY_BYTES }

export interface ConnectWebhookResult {
  status: number
  body: Record<string, unknown>
}

/** Strict on purpose: anything but the exact string 'true' keeps the webhook inert. */
export function isConnectWebhookEnabled(value: string | undefined | null): boolean {
  return value === 'true'
}

// ---------------------------------------------------------------------------------------------------------
// UNVERIFIED against live MP (task 0.3)
// The real mp-connect payload and the x-signature manifest have not been captured yet. Everything that depends on
// them lives in this section: the payload shape, the deauthorization marker and the manifest. The assumptions are
// copied from the other Mercado Pago webhooks (mp-webhook): body `{type, action, data: {id}}` and manifest
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. The flag stays off until task 0.3 confirms or fixes them.

const CONNECT_TOPIC = 'mp-connect'
const DEAUTHORIZE_ACTION = 'application.deauthorized'

export type ConnectNotification =
  | { kind: 'deauthorize'; mpUserId: string; dataId: string }
  | { kind: 'other' }

export function parseConnectNotification(body: unknown): ConnectNotification {
  if (typeof body !== 'object' || body === null) return { kind: 'other' }
  const { type, action, data } = body as { type?: unknown; action?: unknown; data?: unknown }
  if (type !== CONNECT_TOPIC || action !== DEAUTHORIZE_ACTION) return { kind: 'other' }
  if (typeof data !== 'object' || data === null) return { kind: 'other' }
  const id = (data as { id?: unknown }).id
  let value: string | null = null
  if (typeof id === 'string' && id !== '') value = id
  else if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) value = String(id)
  return value ? { kind: 'deauthorize', mpUserId: value, dataId: value } : { kind: 'other' }
}

export function buildConnectManifest(dataId: string, requestId: string, ts: string): string {
  return `id:${dataId};request-id:${requestId};ts:${ts};`
}

function readDataId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const data = (body as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const id = (data as { id?: unknown }).id
  if (typeof id === 'string' && id !== '') return id
  if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) return String(id)
  return null
}

/** Candidate ids for the manifest: the body's `data.id` and the `data.id` query parameter. */
export function candidateDataIds(body: unknown, queryDataId: string | null): string[] {
  const ids = [readDataId(body), queryDataId].filter((id): id is string => !!id)
  return [...new Set(ids)]
}
// ---------------------------------------------------------------------------------------------------------

async function signatureMatches(input: ConnectWebhookInput, body: unknown): Promise<boolean> {
  if (!input.signatureHeader || !input.requestId) return false
  const parsed = parseSignatureHeader(input.signatureHeader)
  if (!parsed || !isFreshTimestamp(parsed.ts, input.nowMs)) return false
  for (const dataId of candidateDataIds(body, input.queryDataId)) {
    const expected = await computeSignature(
      input.secret,
      buildConnectManifest(dataId, input.requestId, parsed.ts),
    )
    if (timingSafeEqualStrings(expected, parsed.v1)) return true
  }
  return false
}

export interface ConnectWebhookInput {
  /** Raw value of MP_CONNECT_WEBHOOK_ENABLED. */
  enabled: string | undefined
  secret: string
  signatureHeader: string | null
  requestId: string | null
  queryDataId: string | null
  rawBody: string
  nowMs: number
}

export interface ConnectWebhookDeps {
  /** Marks every non-unlinked connection of that Mercado Pago user as unlinked. Returns how many rows changed. */
  unlinkByMpUserId: (mpUserId: string) => Promise<number>
}

/** Throws only when the store fails (the caller answers 5xx so Mercado Pago retries). */
export async function processConnectWebhook(
  input: ConnectWebhookInput,
  deps: ConnectWebhookDeps,
): Promise<ConnectWebhookResult> {
  if (!isConnectWebhookEnabled(input.enabled)) return { status: 200, body: { ignored: 'disabled' } }
  if (!input.secret) return { status: 500, body: { error: 'server_misconfigured' } }

  let body: unknown = null
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    body = null
  }

  // Authenticate: nothing else happens before this passes.
  if (!(await signatureMatches(input, body))) {
    return { status: 401, body: { error: 'invalid_signature' } }
  }

  const notification = parseConnectNotification(body)
  if (notification.kind !== 'deauthorize') return { status: 200, body: { ignored: 'action' } }
  if (!isSafeId(notification.mpUserId)) return { status: 200, body: { ignored: 'action' } }

  const changed = await deps.unlinkByMpUserId(notification.mpUserId)
  if (changed === 0) return { status: 200, body: { ignored: 'unknown_connection' } }
  return { status: 200, body: { handled: 'unlinked' } }
}
