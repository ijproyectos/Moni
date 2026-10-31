import { describe, expect, it, vi } from 'vitest'
import { buildManifest, computeSignature } from '../mp-webhook/lib.ts'
import {
  isConnectWebhookEnabled,
  parseConnectNotification,
  processConnectWebhook,
  type ConnectWebhookDeps,
  type ConnectWebhookInput,
} from './lib.ts'

const SECRET = 'test-secret'
const TS = '1742505638683'
const NOW = 1742505638683 + 60_000
const REQUEST_ID = 'req-1'
const MP_USER = '987654'

const deauthBody = JSON.stringify({
  type: 'mp-connect',
  action: 'application.deauthorized',
  data: { id: MP_USER },
})

async function signed(dataId: string): Promise<string> {
  const v1 = await computeSignature(SECRET, buildManifest(dataId, REQUEST_ID, TS))
  return `ts=${TS},v1=${v1}`
}

async function input(overrides: Partial<ConnectWebhookInput> = {}): Promise<ConnectWebhookInput> {
  return {
    enabled: 'true',
    secret: SECRET,
    signatureHeader: await signed(MP_USER),
    requestId: REQUEST_ID,
    queryDataId: null,
    rawBody: deauthBody,
    nowMs: NOW,
    ...overrides,
  }
}

function deps(count = 1): ConnectWebhookDeps & { unlink: ReturnType<typeof vi.fn> } {
  const unlink = vi.fn(async () => count)
  return { unlinkByMpUserId: unlink, unlink }
}

describe('isConnectWebhookEnabled', () => {
  it('is true only for the exact string true', () => {
    expect(isConnectWebhookEnabled('true')).toBe(true)
    for (const v of [undefined, '', 'TRUE', 'True', '1', 'yes', ' true', 'false']) {
      expect(isConnectWebhookEnabled(v)).toBe(false)
    }
  })
})

describe('parseConnectNotification', () => {
  it('reads a deauthorization', () => {
    expect(parseConnectNotification(JSON.parse(deauthBody))).toEqual({
      kind: 'deauthorize',
      mpUserId: MP_USER,
      dataId: MP_USER,
    })
  })
  it('accepts a numeric id as text', () => {
    const body = { type: 'mp-connect', action: 'application.deauthorized', data: { id: 987654 } }
    expect(parseConnectNotification(body)).toMatchObject({ kind: 'deauthorize', mpUserId: '987654' })
  })
  it('classifies other actions and garbage as other', () => {
    expect(parseConnectNotification({ type: 'mp-connect', action: 'application.authorized', data: { id: '1' } }).kind).toBe('other')
    expect(parseConnectNotification({ type: 'payment', action: 'application.deauthorized', data: { id: '1' } }).kind).toBe('other')
    expect(parseConnectNotification(null).kind).toBe('other')
    expect(parseConnectNotification('x').kind).toBe('other')
    expect(parseConnectNotification({ type: 'mp-connect', action: 'application.deauthorized', data: {} }).kind).toBe('other')
  })
})

describe('processConnectWebhook', () => {
  it('answers 200 ignored:disabled without any work while the flag is off', async () => {
    const d = deps()
    const res = await processConnectWebhook(await input({ enabled: 'false', signatureHeader: null }), d)
    expect(res).toEqual({ status: 200, body: { ignored: 'disabled' } })
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('answers 401 for a missing, malformed, stale or wrong signature and does nothing', async () => {
    const d = deps()
    const bad = [
      null,
      'garbage',
      `ts=${TS},v1=${'0'.repeat(64)}`,
      await signed('another-id'),
    ]
    for (const header of bad) {
      const res = await processConnectWebhook(await input({ signatureHeader: header }), d)
      expect(res).toEqual({ status: 401, body: { error: 'invalid_signature' } })
    }
    const stale = await processConnectWebhook(await input({ nowMs: NOW + 48 * 3600 * 1000 }), d)
    expect(stale.status).toBe(401)
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('answers 500 when the secret is not configured', async () => {
    const d = deps()
    const res = await processConnectWebhook(await input({ secret: '' }), d)
    expect(res.status).toBe(500)
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('unlinks the matching connection on a valid deauthorization', async () => {
    const d = deps(1)
    const res = await processConnectWebhook(await input(), d)
    expect(res).toEqual({ status: 200, body: { handled: 'unlinked' } })
    expect(d.unlink).toHaveBeenCalledWith(MP_USER)
  })

  it('verifies the signature against the query data.id too', async () => {
    const d = deps(1)
    const res = await processConnectWebhook(
      await input({ rawBody: 'not json', queryDataId: MP_USER }),
      d,
    )
    expect(res.status).toBe(200)
  })

  it('is a 200 no-op for an unknown or already unlinked mp user', async () => {
    const d = deps(0)
    const res = await processConnectWebhook(await input(), d)
    expect(res).toEqual({ status: 200, body: { ignored: 'unknown_connection' } })
  })

  it('acknowledges other valid notifications without work', async () => {
    const d = deps()
    const body = JSON.stringify({ type: 'mp-connect', action: 'application.authorized', data: { id: MP_USER } })
    const res = await processConnectWebhook(await input({ rawBody: body }), d)
    expect(res).toEqual({ status: 200, body: { ignored: 'action' } })
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('rejects an unsafe mp user id as ignored', async () => {
    const id = '1; drop'
    const body = JSON.stringify({ type: 'mp-connect', action: 'application.deauthorized', data: { id } })
    const d = deps()
    const res = await processConnectWebhook(
      await input({ rawBody: body, signatureHeader: await signed(id) }),
      d,
    )
    expect(res.status).toBe(200)
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('lets a store failure surface so the caller can answer 5xx', async () => {
    const d: ConnectWebhookDeps = { unlinkByMpUserId: async () => { throw new Error('db') } }
    await expect(processConnectWebhook(await input(), d)).rejects.toThrow('db')
  })
})
