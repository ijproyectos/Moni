// Mercado Pago HTTP client: OAuth authorize URL, code exchange, token refresh and authenticated GETs.
// Web-standard APIs only (fetch is injected), so Vitest runs the tests from Node. Later units (mp-sync) reuse
// `get` and the error classes.
//
// Errors carry a class and an HTTP status only. Response bodies, tokens and the client secret are never put in
// an error message or a log line.

export const MP_API_BASE = 'https://api.mercadopago.com'
export const MP_AUTH_URL = 'https://auth.mercadopago.com.ar/authorization'
export const MP_OAUTH_SCOPE = 'offline_access read write'
const DEFAULT_TIMEOUT_MS = 10_000

export class MpApiError extends Error {
  readonly status: number
  /** Numeric/string cause code from the MP error body (e.g. '1000'), never body text. Set by the client. */
  mpCode: string | null = null
  constructor(status: number, label = 'mp_api_error') {
    super(`${label}:${status}`)
    this.name = new.target.name
    this.status = status
  }
}
/** 400 invalid_grant: the code or refresh token is dead; the connection must be relinked. */
export class MpInvalidGrantError extends MpApiError {
  constructor(status = 400) {
    super(status, 'mp_invalid_grant')
  }
}
/** 401 on an API call: the access token was rejected (one refresh may fix it). */
export class MpAuthError extends MpApiError {
  constructor(status = 401) {
    super(status, 'mp_auth')
  }
}
/** 429: back off. */
export class MpRateLimitError extends MpApiError {
  readonly retryAfterSeconds: number | null
  constructor(retryAfterSeconds: number | null) {
    super(429, 'mp_rate_limited')
    this.retryAfterSeconds = retryAfterSeconds
  }
}
/** 5xx, network failure, timeout or a malformed success body: transient. */
export class MpServerError extends MpApiError {
  constructor(status = 0) {
    super(status, 'mp_unavailable')
  }
}

export interface MpOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface MpClientOptions extends MpOAuthConfig {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  timeoutMs?: number
}

export interface MpTokens {
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  mpUserId: string
}

/** The URL the browser is sent to. Contains the public client id and the state only. */
export function buildAuthorizeUrl(config: Pick<MpOAuthConfig, 'clientId' | 'redirectUri'>, state: string): string {
  const url = new URL(MP_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('platform_id', 'mp')
  url.searchParams.set('scope', MP_OAUTH_SCOPE)
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', config.redirectUri)
  return url.toString()
}

function mapFailure(response: Response, errorCode: string | null): MpApiError {
  const status = response.status
  if (status === 429) {
    const raw = Number(response.headers.get('retry-after'))
    return new MpRateLimitError(Number.isFinite(raw) && raw > 0 ? Math.min(raw, 3600) : null)
  }
  if (status >= 500) return new MpServerError(status)
  if (status === 400 && errorCode === 'invalid_grant') return new MpInvalidGrantError(status)
  if (status === 401) return new MpAuthError(status)
  return new MpApiError(status)
}

export function createMpClient(options: MpClientOptions) {
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await doFetch(url, { ...init, signal: controller.signal })
    } catch {
      console.error('mpApi: request failed (network)')
      throw new MpServerError(0)
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      let errorCode: string | null = null
      let causeCode: string | null = null
      try {
        const parsed: unknown = await response.json()
        if (typeof parsed === 'object' && parsed !== null) {
          const e = (parsed as { error?: unknown }).error
          if (typeof e === 'string') errorCode = e
          const cause = (parsed as { cause?: unknown }).cause
          const first: unknown = Array.isArray(cause) ? cause[0] : undefined
          const c = typeof first === 'object' && first !== null ? (first as { code?: unknown }).code : undefined
          if (typeof c === 'number' || (typeof c === 'string' && /^\d{1,6}$/.test(c))) causeCode = String(c)
        }
      } catch {
        // body is never needed beyond the error code
      }
      const error = mapFailure(response, errorCode)
      error.mpCode = causeCode
      console.error('mpApi: request failed', error.name, response.status)
      throw error
    }
    try {
      return await response.json()
    } catch {
      throw new MpServerError(response.status)
    }
  }

  function parseTokens(body: unknown): MpTokens {
    const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const { access_token: at, refresh_token: rt, expires_in: exp, user_id: uid } = b
    const userId = typeof uid === 'number' || typeof uid === 'string' ? String(uid) : ''
    if (typeof at !== 'string' || !at || typeof rt !== 'string' || !rt || typeof exp !== 'number' || !userId) {
      throw new MpServerError(200)
    }
    return { accessToken: at, refreshToken: rt, expiresInSeconds: exp, mpUserId: userId }
  }

  function tokenRequest(body: Record<string, string>): Promise<unknown> {
    return request(`${MP_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        ...body,
      }),
    })
  }

  return {
    async exchangeCode(code: string): Promise<MpTokens> {
      return parseTokens(
        await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: options.redirectUri,
        }),
      )
    },
    /** MP rotates the refresh token: the caller MUST persist the returned one before using the new access token. */
    async refreshToken(refreshToken: string): Promise<MpTokens> {
      return parseTokens(
        await tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: MP_OAUTH_SCOPE,
        }),
      )
    },
    async get(path: string, accessToken: string, query?: Record<string, string>): Promise<unknown> {
      const qs = query && Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : ''
      return request(`${MP_API_BASE}${path}${qs}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      })
    },
  }
}

export type MpClient = ReturnType<typeof createMpClient>
