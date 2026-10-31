/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures index known-present values */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Runs the inline script of public/mp/callback.html against fakes (no real navigation, no network).
const html = readFileSync(resolve(process.cwd(), 'public/mp/callback.html'), 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!

interface Harness {
  replaced: string[]
  fetchCalls: { url: string; init: RequestInit }[]
  session: Map<string, string>
  title: { textContent: string }
}

async function runPage(opts: {
  search?: string
  local?: Record<string, string>
  fetchImpl?: () => Promise<Response>
  sessionStorageThrows?: boolean
}): Promise<Harness> {
  const local = new Map(Object.entries(opts.local ?? {}))
  const session = new Map<string, string>()
  const replaced: string[] = []
  const fetchCalls: Harness['fetchCalls'] = []
  const title = { textContent: '' }
  const el = { textContent: '' }
  const keys = () => [...local.keys()]
  const win = {
    location: { search: opts.search ?? '?code=abc&state=xyz', pathname: '/mp/callback.html', replace: (u: string) => replaced.push(u) },
    history: { replaceState: () => {} },
    localStorage: {
      get length() {
        return local.size
      },
      key: (i: number) => keys()[i] ?? null,
      getItem: (k: string) => local.get(k) ?? null,
    },
    sessionStorage: {
      setItem: (k: string, v: string) => {
        if (opts.sessionStorageThrows) throw new Error('blocked')
        session.set(k, v)
      },
    },
    setTimeout: (fn: () => void) => fn(),
  }
  const doc = { getElementById: (id: string) => (id === 'title' ? title : el) }
  const fakeFetch = (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init })
    return (opts.fetchImpl ?? (async () => new Response('{}', { status: 200 })))()
  }
  new Function('window', 'document', 'fetch', script)(win, doc, fakeFetch)
  await new Promise((r) => setTimeout(r, 0))
  return { replaced, fetchCalls, session, title }
}

const sessionJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ access_token: 'JWT', refresh_token: 'RT', expires_at: Math.floor(Date.now() / 1000) + 3600, ...over })
const KEY = 'sb-abcdefghij-auth-token'

describe('public/mp/callback.html', () => {
  it('posts to the API base stored by the app (local dev / custom auth domain) with the session token', async () => {
    const h = await runPage({ local: { [KEY]: sessionJson(), 'moni.mp.apiBase': 'http://127.0.0.1:54321' } })
    expect(h.fetchCalls[0]!.url).toBe('http://127.0.0.1:54321/functions/v1/mp-oauth-callback')
    expect((h.fetchCalls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer JWT')
    expect(h.replaced).toEqual(['/cuentas?mp=ok'])
  })

  it('falls back to the hosted project URL derived from the session key name', async () => {
    const h = await runPage({ local: { [KEY]: sessionJson() } })
    expect(h.fetchCalls[0]!.url).toBe('https://abcdefghij.supabase.co/functions/v1/mp-oauth-callback')
  })

  it.each(['http://evil.example', 'https://user:pw@evil.example', 'javascript:alert(1)', 'not a url'])(
    'ignores an unsafe stored base (%s) and uses the fallback',
    async (bad) => {
      const h = await runPage({ local: { [KEY]: sessionJson(), 'moni.mp.apiBase': bad } })
      expect(h.fetchCalls[0]!.url).toBe('https://abcdefghij.supabase.co/functions/v1/mp-oauth-callback')
    },
  )

  it('an expired access token is NOT sent: code/state are parked for the app, nothing goes into the URL', async () => {
    const h = await runPage({ local: { [KEY]: sessionJson({ expires_at: Math.floor(Date.now() / 1000) - 60 }) } })
    expect(h.fetchCalls).toHaveLength(0)
    expect(h.replaced).toEqual(['/cuentas?mp=pending'])
    const parked = JSON.parse(h.session.get('moni.mp.pending')!) as Record<string, unknown>
    expect(parked).toMatchObject({ code: 'abc', state: 'xyz' })
    expect(h.replaced.join()).not.toMatch(/abc|xyz|JWT|RT/)
  })

  it('a 401 from the function also hands over to the app', async () => {
    const h = await runPage({
      local: { [KEY]: sessionJson() },
      fetchImpl: async () => new Response(JSON.stringify({ error: 'session_required' }), { status: 401 }),
    })
    expect(h.replaced).toEqual(['/cuentas?mp=pending'])
    expect(h.session.has('moni.mp.pending')).toBe(true)
  })

  it('without any session it reports session_required; with blocked sessionStorage too', async () => {
    expect((await runPage({})).replaced).toEqual(['/cuentas?mp=error&reason=session_required'])
    const h = await runPage({
      local: { [KEY]: sessionJson({ expires_at: 1 }) },
      sessionStorageThrows: true,
    })
    expect(h.replaced).toEqual(['/cuentas?mp=error&reason=session_required'])
  })

  it('denied / missing params never touch the network', async () => {
    const h = await runPage({ search: '?error=access_denied', local: { [KEY]: sessionJson() } })
    expect(h.fetchCalls).toHaveLength(0)
    expect(h.replaced).toEqual(['/cuentas?mp=error&reason=denied'])
  })

  it('never logs or stores the token anywhere else', async () => {
    const h = await runPage({ local: { [KEY]: sessionJson({ expires_at: 1 }) } })
    expect(JSON.stringify([...h.session.entries()])).not.toMatch(/JWT|RT/)
  })
})
