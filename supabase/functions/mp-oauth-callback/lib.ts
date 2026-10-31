// Pure logic of the mp-oauth-callback Edge Function (no Deno / npm imports, so Vitest runs it from Node).
// verify_jwt = false: authentication is the single-use state PLUS a session JWT whose uid matches the state's user.

import { MpInvalidGrantError, type MpTokens } from '../_shared/mpApi.ts'
import { computeImportSince, sha256Hex, type HandlerResult, type ImportWindow } from '../mp-oauth/lib.ts'

export const MAX_BODY_BYTES = 2048
const MAX_CODE_LENGTH = 512
const MAX_STATE_LENGTH = 128

export type ParsedCallback = { ok: true; code: string; state: string } | { ok: false }

export function parseCallbackBody(body: unknown): ParsedCallback {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false }
  const { code, state } = body as { code?: unknown; state?: unknown }
  if (typeof code !== 'string' || typeof state !== 'string') return { ok: false }
  if (code === '' || state === '' || code.length > MAX_CODE_LENGTH || state.length > MAX_STATE_LENGTH) {
    return { ok: false }
  }
  return { ok: true, code, state }
}

export interface ConnectionRow {
  userId: string
  mpUserId: string
  accountId: string
  accessTokenEnc: string
  refreshTokenEnc: string
  keyVersion: string
  expiresAt: string
  importSince: string
  cursorAt: string
  consentVersion: string
  consentedAt: string
}

export interface CallbackDeps {
  now(): Date
  /** claim_mp_oauth_state: null for unknown, reused, expired or other-user state (consumes only on success). */
  claimState(
    stateHash: string,
    callerUid: string,
  ): Promise<{ importWindow: ImportWindow; consentVersion: string } | null>
  exchangeCode(code: string): Promise<MpTokens>
  encrypt(plaintext: string, column: 'access_token_enc' | 'refresh_token_enc'): Promise<string>
  keyVersion(): string
  ensureWallet(userId: string): Promise<string>
  /** Upserts the user's row (status active, failures reset). 'account_in_use' on the partial unique index. */
  upsertConnection(row: ConnectionRow): Promise<'ok' | 'account_in_use'>
}

export async function handleCallback(
  deps: CallbackDeps,
  input: { userId: string | null; code: string; state: string },
): Promise<HandlerResult> {
  // Default (open question e): a session is required and nothing is claimed or exchanged without it.
  if (!input.userId) return { http: 401, body: { error: 'session_required' } }
  try {
    const claimed = await deps.claimState(await sha256Hex(input.state), input.userId)
    if (!claimed) return { http: 400, body: { error: 'invalid_state' } }

    let tokens: MpTokens
    try {
      tokens = await deps.exchangeCode(input.code)
    } catch (error) {
      if (error instanceof MpInvalidGrantError) return { http: 400, body: { error: 'code_rejected' } }
      return { http: 502, body: { error: 'mp_unavailable' } }
    }

    const now = deps.now()
    const importSince = computeImportSince(claimed.importWindow, now).toISOString()
    const accessTokenEnc = await deps.encrypt(tokens.accessToken, 'access_token_enc')
    const refreshTokenEnc = await deps.encrypt(tokens.refreshToken, 'refresh_token_enc')
    const accountId = await deps.ensureWallet(input.userId)
    const outcome = await deps.upsertConnection({
      userId: input.userId,
      mpUserId: tokens.mpUserId,
      accountId,
      accessTokenEnc,
      refreshTokenEnc,
      keyVersion: deps.keyVersion(),
      expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000).toISOString(),
      importSince,
      cursorAt: importSince,
      consentVersion: claimed.consentVersion,
      consentedAt: now.toISOString(),
    })
    if (outcome === 'account_in_use') return { http: 409, body: { error: 'mp_account_in_use' } }
    return { http: 200, body: { status: 'ok' } }
  } catch {
    return { http: 500, body: { error: 'server_error' } }
  }
}
