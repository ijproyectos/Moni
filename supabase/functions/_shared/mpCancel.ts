// Cancelling a Mercado Pago preapproval (PUT /preapproval/{id} { status }). Shared by plus-subscription and
// mp-webhook. No Deno / npm imports, so Vitest runs it from Node.
//
// The spelling of the cancel status is NOT verified against the official API reference (the reference pages could
// not be fetched when this was written; the Mercado Pago plugin guides say `canceled`, while the notifications and
// reads may say `cancelled`). So: try the preferred spelling; on HTTP 400 retry EXACTLY ONCE with the other one and
// remember, per runtime instance, the spelling that worked. Never loops.

export const CANCEL_SPELLINGS = ['canceled', 'cancelled'] as const
export type CancelSpelling = (typeof CANCEL_SPELLINGS)[number]

/** First spelling tried. */
export const MP_CANCEL_STATUS: CancelSpelling = CANCEL_SPELLINGS[0]

let preferred: CancelSpelling = MP_CANCEL_STATUS

/** Spelling currently tried first (module scope: survives between calls of a warm instance). */
export function currentCancelSpelling(): CancelSpelling {
  return preferred
}

/** Test helper: forget the remembered spelling. */
export function resetCancelSpelling(): void {
  preferred = MP_CANCEL_STATUS
}

export interface CancelAttempt {
  status: number
  json: unknown | null
}

/**
 * Sends the cancel through `send(mpStatus)`. A 400 triggers one retry with the other spelling; the spelling that
 * gets a 2xx is remembered. Any other outcome is returned as is.
 */
export async function cancelWithFallback(
  send: (mpStatus: CancelSpelling) => Promise<CancelAttempt>,
): Promise<CancelAttempt> {
  const first = preferred
  const result = await send(first)
  if (result.status !== 400) return result
  const second: CancelSpelling = first === 'canceled' ? 'cancelled' : 'canceled'
  const retry = await send(second)
  if (retry.status >= 200 && retry.status < 300) preferred = second
  return retry
}
