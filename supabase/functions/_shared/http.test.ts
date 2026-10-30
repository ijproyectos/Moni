import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAnthropic, corsHeaders, jsonResponse, readBodyCapped } from './http.ts'

afterEach(() => vi.restoreAllMocks())

describe('corsHeaders / jsonResponse', () => {
  it('echoes only the allowed origin and never caches', async () => {
    expect(corsHeaders(null)).toEqual({ Vary: 'Origin' })
    const res = jsonResponse(429, { error: 'ai_quota_exceeded' }, 'https://app.moni.test')
    expect(res.status).toBe(429)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.moni.test')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'ai_quota_exceeded' })
  })
})

describe('readBodyCapped', () => {
  const post = (body: string) => new Request('https://x.test', { method: 'POST', body })

  it('returns the text when under the cap', async () => {
    expect(await readBodyCapped(post('hola'), 10)).toBe('hola')
  })

  it('returns null as soon as the body exceeds the cap', async () => {
    expect(await readBodyCapped(post('x'.repeat(50)), 10)).toBeNull()
  })

  it('returns an empty string when there is no body', async () => {
    expect(await readBodyCapped(new Request('https://x.test', { method: 'GET' }), 10)).toBe('')
  })
})

describe('callAnthropic', () => {
  it('returns null and logs only the status on a non-OK response', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-body', { status: 500 })))
    const result = await callAnthropic(
      'https://a.test',
      '2023-06-01',
      'key-123',
      { a: 1 },
      1000,
      'x',
    )
    expect(result).toBeNull()
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/secret-body|key-123/)
    vi.unstubAllGlobals()
  })

  it('sends the key and version headers and returns the JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    const result = await callAnthropic(
      'https://a.test',
      '2023-06-01',
      'key-123',
      { a: 1 },
      1000,
      'x',
    )
    expect(result).toEqual({ ok: true })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('key-123')
    vi.unstubAllGlobals()
  })

  it('returns null when the call throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom with secret')))
    expect(await callAnthropic('https://a.test', 'v', 'k', {}, 1000, 'x')).toBeNull()
    vi.unstubAllGlobals()
  })
})
