import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizeUrl,
  createMpClient,
  MpApiError,
  MpAuthError,
  MpInvalidGrantError,
  MpRateLimitError,
  MpServerError,
} from './mpApi.ts'

const config = {
  clientId: 'cid-123',
  clientSecret: 'SECRET-xyz',
  redirectUri: 'https://app.example.com/mp/callback.html',
}

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(
    async (...args: [url: string, init?: RequestInit]) => {
      void args
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
    },
  )
}
const tokenBody = {
  access_token: 'AT-1',
  refresh_token: 'RT-1',
  expires_in: 15552000,
  user_id: 98765,
  scope: 'offline_access read write',
}

describe('buildAuthorizeUrl', () => {
  it('builds the MP authorization URL with state, redirect and offline_access', () => {
    const url = new URL(buildAuthorizeUrl(config, 'state-abc'))
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.ar/authorization')
    expect(url.searchParams.get('client_id')).toBe('cid-123')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('state-abc')
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(url.searchParams.get('scope')).toContain('offline_access')
    expect(url.toString()).not.toContain('SECRET')
  })
})

describe('exchangeCode', () => {
  it('posts the authorization_code grant and normalizes the response', async () => {
    const fetchFn = stub(200, tokenBody)
    const client = createMpClient({ ...config, fetch: fetchFn })
    const out = await client.exchangeCode('code-1')
    expect(out).toEqual({
      accessToken: 'AT-1',
      refreshToken: 'RT-1',
      expiresInSeconds: 15552000,
      mpUserId: '98765',
    })
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe('https://api.mercadopago.com/oauth/token')
    expect(init?.method).toBe('POST')
    const sent = JSON.parse(String(init?.body))
    expect(sent).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'cid-123',
      client_secret: 'SECRET-xyz',
      redirect_uri: config.redirectUri,
    })
  })

  it('rejects an incomplete token response as a server error', async () => {
    const client = createMpClient({ ...config, fetch: stub(200, { access_token: 'x' }) })
    await expect(client.exchangeCode('c')).rejects.toBeInstanceOf(MpServerError)
  })
})

describe('refreshToken', () => {
  it('sends refresh_token grant with offline_access and returns the rotated refresh token', async () => {
    const fetchFn = stub(200, { ...tokenBody, refresh_token: 'RT-2' })
    const client = createMpClient({ ...config, fetch: fetchFn })
    const out = await client.refreshToken('RT-1')
    expect(out.refreshToken).toBe('RT-2')
    const sent = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))
    expect(sent).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'RT-1' })
    expect(sent.scope).toContain('offline_access')
  })
})

describe('error mapping', () => {
  it('400 invalid_grant -> MpInvalidGrantError', async () => {
    const client = createMpClient({ ...config, fetch: stub(400, { error: 'invalid_grant' }) })
    await expect(client.refreshToken('RT')).rejects.toBeInstanceOf(MpInvalidGrantError)
  })

  it('429 -> MpRateLimitError with retry-after seconds', async () => {
    const client = createMpClient({
      ...config,
      fetch: stub(429, { message: 'local_rate_limited' }, { 'retry-after': '7' }),
    })
    const err = await client.exchangeCode('c').catch((e) => e)
    expect(err).toBeInstanceOf(MpRateLimitError)
    expect(err.retryAfterSeconds).toBe(7)
  })

  it('5xx and network failures -> MpServerError', async () => {
    await expect(
      createMpClient({ ...config, fetch: stub(503, 'oops') }).exchangeCode('c'),
    ).rejects.toBeInstanceOf(MpServerError)
    const failing = vi.fn(async () => {
      throw new TypeError('network down')
    })
    await expect(createMpClient({ ...config, fetch: failing }).exchangeCode('c')).rejects.toBeInstanceOf(
      MpServerError,
    )
  })

  it('exposes the numeric cause code of a failed GET as mpCode (no body text)', async () => {
    const failure = async (promise: Promise<unknown>): Promise<MpApiError> => {
      try {
        await promise
      } catch (e) {
        return e as MpApiError
      }
      throw new Error('expected a failure')
    }
    const err = await failure(
      createMpClient({
        ...config,
        fetch: stub(400, { message: 'SECRET body text', error: 'bad_request', cause: [{ code: 1000 }] }),
      }).get('/v1/payments/search', 'AT'),
    )
    expect(err).toBeInstanceOf(MpApiError)
    expect(err.mpCode).toBe('1000')
    expect(err.message).not.toContain('SECRET')
    const none = await failure(createMpClient({ ...config, fetch: stub(400, 'not json') }).get('/x', 'AT'))
    expect(none.mpCode).toBeNull()
  })

  it('401 -> MpAuthError, other 4xx -> MpApiError', async () => {
    await expect(
      createMpClient({ ...config, fetch: stub(401, { message: 'invalid_token' }) }).get('/v1/x', 'AT'),
    ).rejects.toBeInstanceOf(MpAuthError)
    const err = await createMpClient({ ...config, fetch: stub(400, { error: 'invalid_client' }) })
      .exchangeCode('c')
      .catch((e) => e)
    expect(err).toBeInstanceOf(MpApiError)
    expect(err).not.toBeInstanceOf(MpInvalidGrantError)
  })

  it('never puts tokens, secrets or response bodies in errors or logs', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = { error: 'invalid_grant', message: 'refresh RT-LEAK secret SECRET-xyz' }
    const err = await createMpClient({ ...config, fetch: stub(400, body) })
      .refreshToken('RT-LEAK')
      .catch((e) => e)
    const text = `${String(err)} ${err.message} ${JSON.stringify(err)} ${spy.mock.calls.flat().join(' ')}`
    expect(text).not.toContain('RT-LEAK')
    expect(text).not.toContain('SECRET-xyz')
    spy.mockRestore()
  })
})

describe('get', () => {
  it('sends a bearer token and query params, returns parsed JSON', async () => {
    const fetchFn = stub(200, { results: [] })
    const client = createMpClient({ ...config, fetch: fetchFn })
    const out = await client.get('/v1/payments/search', 'AT-9', { limit: '50', offset: '0' })
    expect(out).toEqual({ results: [] })
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe('https://api.mercadopago.com/v1/payments/search?limit=50&offset=0')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer AT-9')
  })
})
