import { describe, expect, it, vi } from 'vitest'
import { MpInvalidGrantError, MpRateLimitError, MpServerError } from '../_shared/mpApi.ts'
import { sha256Hex } from '../mp-oauth/lib.ts'
import { handleCallback, parseCallbackBody, type CallbackDeps } from './lib.ts'

const NOW = new Date('2026-11-12T12:00:00Z')
const tokens = { accessToken: 'AT', refreshToken: 'RT', expiresInSeconds: 1000, mpUserId: '777' }

function deps(over: Partial<CallbackDeps> = {}): CallbackDeps {
  return {
    now: () => NOW,
    claimState: vi.fn(async () => ({ importWindow: '30' as const, consentVersion: 'mp-import-v1' })),
    exchangeCode: vi.fn(async () => tokens),
    encrypt: vi.fn(async (plain: string, column: string) => `enc(${column}:${plain.length})`),
    keyVersion: () => '1',
    ensureWallet: vi.fn(async () => 'acc-1'),
    upsertConnection: vi.fn(async () => 'ok' as const),
    ...over,
  }
}
const input = { userId: 'u1', code: 'code-1', state: 'state-1' }

describe('parseCallbackBody', () => {
  it('accepts code + state strings only', () => {
    expect(parseCallbackBody({ code: 'a', state: 'b' })).toEqual({ ok: true, code: 'a', state: 'b' })
    expect(parseCallbackBody({ code: 'a' }).ok).toBe(false)
    expect(parseCallbackBody({ code: 1, state: 'b' }).ok).toBe(false)
    expect(parseCallbackBody({ code: 'x'.repeat(600), state: 'b' }).ok).toBe(false)
    expect(parseCallbackBody(null).ok).toBe(false)
  })
})

describe('handleCallback state validation', () => {
  it('requires a session: nothing is claimed or exchanged', async () => {
    const d = deps()
    const r = await handleCallback(d, { ...input, userId: null })
    expect(r).toEqual({ http: 401, body: { error: 'session_required' } })
    expect(d.claimState).not.toHaveBeenCalled()
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it.each(['reused', 'expired', 'other-user', 'unknown'])(
    'rejects a %s state without exchanging the code',
    async () => {
      const d = deps({ claimState: vi.fn(async () => null) })
      const r = await handleCallback(d, input)
      expect(r).toEqual({ http: 400, body: { error: 'invalid_state' } })
      expect(d.exchangeCode).not.toHaveBeenCalled()
      expect(d.upsertConnection).not.toHaveBeenCalled()
    },
  )

  it('claims by state hash and caller uid', async () => {
    const d = deps()
    await handleCallback(d, input)
    expect(d.claimState).toHaveBeenCalledWith(await sha256Hex('state-1'), 'u1')
  })
})

describe('handleCallback link', () => {
  it('exchanges, encrypts, ensures the wallet and upserts with cursor = import_since', async () => {
    const d = deps()
    const r = await handleCallback(d, input)
    expect(r).toEqual({ http: 200, body: { status: 'ok' } })
    expect(d.exchangeCode).toHaveBeenCalledWith('code-1')
    expect(d.encrypt).toHaveBeenCalledWith('AT', 'access_token_enc')
    expect(d.encrypt).toHaveBeenCalledWith('RT', 'refresh_token_enc')
    expect(d.ensureWallet).toHaveBeenCalledWith('u1')
    const row = vi.mocked(d.upsertConnection).mock.calls[0]?.[0]
    expect(row).toMatchObject({
      userId: 'u1',
      mpUserId: '777',
      accountId: 'acc-1',
      accessTokenEnc: 'enc(access_token_enc:2)',
      refreshTokenEnc: 'enc(refresh_token_enc:2)',
      keyVersion: '1',
      consentVersion: 'mp-import-v1',
      importSince: '2026-10-13T12:00:00.000Z',
      cursorAt: '2026-10-13T12:00:00.000Z',
      expiresAt: '2026-11-12T12:16:40.000Z',
    })
    expect(JSON.stringify(row)).not.toContain('"AT"')
    expect(JSON.stringify(row)).not.toContain('"RT"')
  })

  it('default window "now" sets cursor = link time', async () => {
    const d = deps({
      claimState: vi.fn(async () => ({ importWindow: 'now' as const, consentVersion: 'mp-import-v1' })),
    })
    await handleCallback(d, input)
    expect(vi.mocked(d.upsertConnection).mock.calls[0]?.[0].cursorAt).toBe(NOW.toISOString())
  })

  it('maps MP failures: invalid_grant -> code_rejected, others -> mp_unavailable; nothing stored', async () => {
    for (const [err, http, code] of [
      [new MpInvalidGrantError(), 400, 'code_rejected'],
      [new MpRateLimitError(3), 502, 'mp_unavailable'],
      [new MpServerError(503), 502, 'mp_unavailable'],
    ] as const) {
      const d = deps({ exchangeCode: vi.fn(async () => Promise.reject(err)) })
      const r = await handleCallback(d, input)
      expect(r).toEqual({ http, body: { error: code } })
      expect(d.upsertConnection).not.toHaveBeenCalled()
    }
  })

  it('reports mp_account_in_use when another Moni user holds that MP account', async () => {
    const d = deps({ upsertConnection: vi.fn(async () => 'account_in_use' as const) })
    expect(await handleCallback(d, input)).toEqual({ http: 409, body: { error: 'mp_account_in_use' } })
  })

  it('returns server_error without leaking details when persistence fails', async () => {
    const d = deps({
      ensureWallet: vi.fn(async () => {
        throw new Error('RT leaked?')
      }),
    })
    const r = await handleCallback(d, input)
    expect(r).toEqual({ http: 500, body: { error: 'server_error' } })
  })
})
