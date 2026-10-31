import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { onlineManager } from '@tanstack/react-query'
import { OfflineError } from '@/shared/lib/offline'
import { isPlusRequired, toUserMessage } from '@/shared/lib/errors'
import {
  MpImportError,
  connectMp,
  dismissDuplicate,
  finishPendingLink,
  getConnection,
  getDuplicates,
  getSubscriptionSuggestions,
  getUnimportedCount,
  rememberApiBase,
  syncNow,
  unlinkMp,
} from './mpImportRepository'

const invoke = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke }, rpc, from }),
}))

const URL_OK = 'https://auth.mercadopago.com.ar/authorization?client_id=1&state=s'
const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }))

describe('mpImport repository', () => {
  beforeEach(() => {
    invoke.mockReset()
    rpc.mockReset()
    from.mockReset()
  })
  afterEach(() => onlineManager.setOnline(true))

  it('connect sends the consent version and the chosen window, and returns the validated URL', async () => {
    invoke.mockResolvedValue({ data: { url: URL_OK }, error: null })
    await expect(connectMp('30')).resolves.toBe(URL_OK)
    expect(invoke).toHaveBeenCalledWith('mp-oauth', {
      body: {
        action: 'start',
        accepted: true,
        consent_version: 'mp-import-v1',
        import_window: '30',
      },
    })
  })

  it.each(['https://evil.example/x', 'javascript:alert(1)', undefined])(
    'refuses to redirect to %s',
    async (url) => {
      invoke.mockResolvedValue({ data: { url }, error: null })
      await expect(connectMp('now')).rejects.toMatchObject({ code: 'mp_import_unavailable' })
    },
  )

  it('maps the Edge Function error code to a friendly Spanish message', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'plus_required' }) })
    const error = await connectMp('now').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(MpImportError)
    expect(isPlusRequired(error)).toBe(true)

    invoke.mockResolvedValue({ data: null, error: httpError(429, { error: 'rate_limited' }) })
    expect(toUserMessage(await syncNow().catch((e: unknown) => e))).toMatch(/unos minutos/)
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: 'needs_reconnect' }) })
    expect(toUserMessage(await syncNow().catch((e: unknown) => e))).toMatch(/volver a vincular/)
  })

  it('falls back to a generic code for non-JSON or network failures', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response('<html>', { status: 502 })),
    })
    await expect(unlinkMp()).rejects.toMatchObject({ code: 'mp_import_unavailable' })
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('x')) })
    await expect(unlinkMp()).rejects.toMatchObject({ code: 'mp_import_unavailable' })
  })

  it('unlink and sync send only their action name', async () => {
    invoke.mockResolvedValue({ data: { status: 'unlinked' }, error: null })
    await unlinkMp()
    expect(invoke).toHaveBeenLastCalledWith('mp-oauth', { body: { action: 'unlink' } })
    invoke.mockResolvedValue({ data: { status: 'started' }, error: null })
    await syncNow()
    expect(invoke).toHaveBeenLastCalledWith('mp-oauth', { body: { action: 'sync' } })
  })

  it.each([
    ['connect', () => connectMp('now')],
    ['unlink', () => unlinkMp()],
    ['sync', () => syncNow()],
    ['dismiss', () => dismissDuplicate('p1')],
  ])('%s refuses offline before any request', async (_name, run) => {
    onlineManager.setOnline(false)
    await expect(run()).rejects.toBeInstanceOf(OfflineError)
    expect(invoke).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reads the connection and the duplicates through RPCs', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          status: 'needs_reconnect',
          mp_user_id: '1',
          import_since: 'x',
          last_sync_at: null,
          last_error_class: null,
        },
      ],
      error: null,
    })
    await expect(getConnection()).resolves.toMatchObject({ status: 'needs_reconnect' })
    expect(rpc).toHaveBeenLastCalledWith('get_my_mp_connection')
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(getDuplicates()).resolves.toEqual([])
    expect(rpc).toHaveBeenLastCalledWith('get_mp_import_duplicates')
  })

  it('dismiss calls the RPC with the payment id', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await dismissDuplicate('p1')
    expect(rpc).toHaveBeenCalledWith('dismiss_mp_import_duplicate', { p_payment_id: 'p1' })
  })

  it('joins skipped-subscription payments with the subscription name', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          payment_id: 'p1',
          merchant: 'NETFLIX',
          occurred_on: '2026-03-10',
          amount: 5000,
          suggested_subscription_id: 's1',
        },
        {
          payment_id: 'p2',
          merchant: null,
          occurred_on: '2026-03-11',
          amount: 100,
          suggested_subscription_id: null,
        },
      ],
      error: null,
    })
    const inIds = vi.fn().mockResolvedValue({ data: [{ id: 's1', name: 'Netflix' }], error: null })
    from.mockImplementation((table: string) =>
      table === 'mp_imported_payments'
        ? { select: () => ({ eq: () => ({ order: () => ({ limit }) }) }) }
        : { select: () => ({ in: inIds }) },
    )
    await expect(getSubscriptionSuggestions()).resolves.toEqual([
      {
        paymentId: 'p1',
        merchant: 'NETFLIX',
        occurredOn: '2026-03-10',
        cents: 500000,
        subscriptionName: 'Netflix',
      },
      {
        paymentId: 'p2',
        merchant: null,
        occurredOn: '2026-03-11',
        cents: 10000,
        subscriptionName: null,
      },
    ])
    expect(inIds).toHaveBeenCalledWith('id', ['s1'])
  })

  it('counts payments that could not be imported (needs_review without a transaction)', async () => {
    const is = vi.fn(async (): Promise<{ count: number | null; error: unknown }> => ({ count: 3, error: null }))
    const eq = vi.fn(() => ({ is }))
    const select = vi.fn(() => ({ eq }))
    from.mockReturnValue({ select })
    await expect(getUnimportedCount()).resolves.toBe(3)
    expect(from).toHaveBeenCalledWith('mp_imported_payments')
    expect(eq).toHaveBeenCalledWith('outcome', 'needs_review')
    expect(is).toHaveBeenCalledWith('transaction_id', null)
    is.mockResolvedValue({ count: null, error: null })
    await expect(getUnimportedCount()).resolves.toBe(0)
    is.mockResolvedValue({ count: null, error: new Error('x') })
    await expect(getUnimportedCount()).rejects.toThrow()
  })

  it('rememberApiBase stores the origin for public/mp/callback.html and ignores unsafe values', () => {
    window.localStorage.clear()
    rememberApiBase('http://127.0.0.1:54321/')
    expect(window.localStorage.getItem('moni.mp.apiBase')).toBe('http://127.0.0.1:54321')
    window.localStorage.clear()
    rememberApiBase('http://evil.example')
    expect(window.localStorage.getItem('moni.mp.apiBase')).toBeNull()
  })

  describe('finishPendingLink (code/state parked by the callback page)', () => {
    const park = (over: Record<string, unknown> = {}) =>
      window.sessionStorage.setItem('moni.mp.pending', JSON.stringify({ code: 'c', state: 's', at: Date.now(), ...over }))
    beforeEach(() => window.sessionStorage.clear())

    it('does nothing when nothing is parked', async () => {
      await expect(finishPendingLink()).resolves.toBe(false)
      expect(invoke).not.toHaveBeenCalled()
    })

    it('consumes the parked pair once and calls mp-oauth-callback through the app session', async () => {
      park()
      invoke.mockResolvedValue({ data: {}, error: null })
      await expect(finishPendingLink()).resolves.toBe(true)
      expect(invoke).toHaveBeenCalledWith('mp-oauth-callback', { body: { code: 'c', state: 's' } })
      expect(window.sessionStorage.getItem('moni.mp.pending')).toBeNull()
      await expect(finishPendingLink()).resolves.toBe(false)
    })

    it('drops a stale pair without calling the server', async () => {
      park({ at: Date.now() - 20 * 60 * 1000 })
      await expect(finishPendingLink()).resolves.toBe(false)
      expect(invoke).not.toHaveBeenCalled()
      expect(window.sessionStorage.getItem('moni.mp.pending')).toBeNull()
    })

    it('surfaces the server error code', async () => {
      park()
      invoke.mockResolvedValue({ data: null, error: httpError(400, { error: 'invalid_state' }) })
      await expect(finishPendingLink()).rejects.toMatchObject({ code: 'invalid_state' })
    })
  })
})
