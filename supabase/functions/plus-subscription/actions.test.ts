import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCancelSpelling } from '../_shared/mpCancel.ts'
import { type ActionDeps, createSubscription, runUserAction } from './actions.ts'
import type { SubscriptionRow } from './lib.ts'

const INIT = 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=new1'
const PREAPPROVAL_OK = { status: 201, json: { id: 'new1', status: 'pending', init_point: INIT } }

const row = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: 'r1',
  preapproval_id: 'pre-r1',
  status: 'authorized',
  created_at: '2026-11-01T10:00:00Z',
  ...over,
})

function makeDeps(over: Partial<ActionDeps> = {}) {
  const deps = {
    mp: vi.fn().mockResolvedValue({ status: 200, json: null }),
    startSubscription: vi.fn().mockResolvedValue({ data: 'sub-new', error: null }),
    setStatus: vi.fn().mockResolvedValue({ error: null }),
    claim: vi.fn().mockResolvedValue({ data: true, error: null }),
    listRows: vi.fn().mockResolvedValue({ data: [], error: null }),
    newReference: vi.fn().mockReturnValue('ref-1234567890123456'),
    log: vi.fn(),
    ...over,
  }
  return deps
}

const create = (deps: ActionDeps) =>
  createSubscription(deps, {
    userId: 'u1',
    payerEmail: 'u@example.com',
    backUrl: 'https://moni.app/plus/gracias',
  })

const calls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => c.slice(0, 3))

beforeEach(() => resetCancelSpelling())

describe('create', () => {
  it('stores the preapproval and returns only init_point and status', async () => {
    const deps = makeDeps({ mp: vi.fn().mockResolvedValue(PREAPPROVAL_OK) })
    expect(await create(deps)).toEqual({
      http: 200,
      body: { init_point: INIT, status: 'pending' },
    })
    expect(deps.setStatus).toHaveBeenCalledWith('sub-new', 'pending', 'new1')
  })

  it.each([
    ['already_subscribed (authorized or paused)', 'already_subscribed', 409, 'already_subscribed'],
    ['create_throttled', 'create_throttled', 429, 'too_many_requests'],
    ['anything else', 'boom', 500, 'server_error'],
  ])('maps a refused start: %s', async (_name, message, http, code) => {
    const deps = makeDeps({
      startSubscription: vi.fn().mockResolvedValue({ data: null, error: { message } }),
    })
    expect(await create(deps)).toEqual({ http, body: { error: code } })
    expect(deps.mp).not.toHaveBeenCalled()
    expect(deps.listRows).not.toHaveBeenCalled()
  })

  it('cancels older pending checkouts on Mercado Pago and in the database before creating', async () => {
    const mp = vi
      .fn()
      .mockImplementation(async (method: string) =>
        method === 'POST' ? PREAPPROVAL_OK : { status: 200, json: null },
      )
    const deps = makeDeps({
      mp,
      listRows: vi.fn().mockResolvedValue({
        data: [
          row({ id: 'sub-new', status: 'pending', preapproval_id: null }),
          row({ id: 'old1', status: 'pending', preapproval_id: 'pre-old1' }),
          row({ id: 'old2', status: 'pending', preapproval_id: null }),
          row({ id: 'old3', status: 'cancelled', preapproval_id: 'pre-old3' }),
        ],
        error: null,
      }),
    })
    expect((await create(deps)).http).toBe(200)
    expect(calls(mp)).toEqual([
      ['PUT', 'https://api.mercadopago.com/preapproval/pre-old1', { status: 'canceled' }],
      ['POST', 'https://api.mercadopago.com/preapproval', expect.anything()],
    ])
    expect(calls(deps.setStatus)).toEqual([
      ['old1', 'cancelled'],
      ['sub-new', 'pending', 'new1'],
    ])
  })

  it('proceeds when the stale cancel fails on Mercado Pago, logging only the status', async () => {
    const mp = vi
      .fn()
      .mockImplementation(async (method: string) =>
        method === 'POST' ? PREAPPROVAL_OK : { status: 500, json: null },
      )
    const deps = makeDeps({
      mp,
      listRows: vi.fn().mockResolvedValue({
        data: [row({ id: 'old1', status: 'pending' })],
        error: null,
      }),
    })
    expect((await create(deps)).http).toBe(200)
    expect(deps.log).toHaveBeenCalledWith('stale pending cancel failed on mercado pago', 500)
    expect(deps.setStatus).not.toHaveBeenCalledWith('old1', 'cancelled')
  })

  it('proceeds when the previous checkouts cannot be listed', async () => {
    const deps = makeDeps({
      mp: vi.fn().mockResolvedValue(PREAPPROVAL_OK),
      listRows: vi.fn().mockResolvedValue({ data: null, error: { code: '57014' } }),
    })
    expect((await create(deps)).http).toBe(200)
    expect(deps.log).toHaveBeenCalledWith('could not list previous checkouts', '57014')
  })

  it.each([
    [0, 'payment_provider_unavailable'],
    [500, 'payment_provider_unavailable'],
    [400, 'payment_provider_error'],
  ])('marks the pending row cancelled when Mercado Pago answers %i', async (status, code) => {
    const deps = makeDeps({ mp: vi.fn().mockResolvedValue({ status, json: null }) })
    expect(await create(deps)).toEqual({ http: 502, body: { error: code } })
    expect(deps.setStatus).toHaveBeenCalledWith('sub-new', 'cancelled')
  })

  it('marks the row cancelled when the response is unusable or the init_point is off-domain', async () => {
    for (const json of [
      { id: 'x', init_point: 'https://evil.example.com/pay' },
      { init_point: INIT },
    ]) {
      const deps = makeDeps({ mp: vi.fn().mockResolvedValue({ status: 201, json }) })
      expect(await create(deps)).toEqual({ http: 502, body: { error: 'payment_provider_error' } })
      expect(deps.setStatus).toHaveBeenCalledWith('sub-new', 'cancelled')
    }
  })

  it('retries the store once and succeeds on the second attempt', async () => {
    const setStatus = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: '40001' } })
      .mockResolvedValueOnce({ error: null })
    const deps = makeDeps({ mp: vi.fn().mockResolvedValue(PREAPPROVAL_OK), setStatus })
    expect((await create(deps)).http).toBe(200)
    expect(setStatus).toHaveBeenCalledTimes(2)
    expect(deps.log).toHaveBeenCalledWith('could not store preapproval, retrying once', '40001')
  })

  it('cancels the orphan preapproval and the row when the store fails twice', async () => {
    const mp = vi
      .fn()
      .mockImplementation(async (method: string) =>
        method === 'POST' ? PREAPPROVAL_OK : { status: 200, json: null },
      )
    const setStatus = vi.fn().mockImplementation(async (_id: string, status: string) => ({
      error: status === 'cancelled' ? null : { code: '08006' },
    }))
    const deps = makeDeps({ mp, setStatus })
    expect(await create(deps)).toEqual({ http: 500, body: { error: 'server_error' } })
    expect(calls(setStatus)).toEqual([
      ['sub-new', 'pending', 'new1'],
      ['sub-new', 'pending', 'new1'],
      ['sub-new', 'cancelled'],
    ])
    expect(calls(mp).at(-1)).toEqual([
      'PUT',
      'https://api.mercadopago.com/preapproval/new1',
      { status: 'canceled' },
    ])
    expect(deps.log).toHaveBeenCalledWith('could not store preapproval', '08006')
  })
})

describe('get', () => {
  it('reconciles with Mercado Pago when the claim is granted', async () => {
    const deps = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'authorized' })], error: null }),
      mp: vi.fn().mockResolvedValue({ status: 200, json: { id: 'pre-r1', status: 'paused' } }),
    })
    expect(await runUserAction(deps, { userId: 'u1', action: 'get' })).toEqual({
      http: 200,
      body: { status: 'paused' },
    })
    expect(deps.claim).toHaveBeenCalledWith('u1', 'r1', 'sync', 15)
    expect(deps.setStatus).toHaveBeenCalledWith('r1', 'paused')
  })

  it('returns the stored state without calling Mercado Pago when throttled', async () => {
    const deps = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'authorized' })], error: null }),
      claim: vi.fn().mockResolvedValue({ data: false, error: null }),
    })
    expect(await runUserAction(deps, { userId: 'u1', action: 'get' })).toEqual({
      http: 200,
      body: { status: 'authorized' },
    })
    expect(deps.mp).not.toHaveBeenCalled()
  })

  it('returns the stored state when the claim itself fails', async () => {
    const deps = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({})], error: null }),
      claim: vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000' } }),
    })
    expect((await runUserAction(deps, { userId: 'u1', action: 'get' })).body).toEqual({
      status: 'authorized',
    })
    expect(deps.mp).not.toHaveBeenCalled()
  })

  it('does not claim or call Mercado Pago for cancelled or missing subscriptions', async () => {
    const cancelled = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'cancelled' })], error: null }),
    })
    expect((await runUserAction(cancelled, { userId: 'u1', action: 'get' })).body).toEqual({
      status: 'cancelled',
    })
    const none = makeDeps()
    expect((await runUserAction(none, { userId: 'u1', action: 'get' })).body).toEqual({
      status: 'none',
    })
    expect(cancelled.claim).not.toHaveBeenCalled()
    expect(none.claim).not.toHaveBeenCalled()
  })
})

describe('pause / reactivate', () => {
  it('pauses an authorized subscription after claiming the write slot', async () => {
    const deps = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'authorized' })], error: null }),
      mp: vi.fn().mockResolvedValue({ status: 200, json: { id: 'pre-r1', status: 'paused' } }),
    })
    expect(await runUserAction(deps, { userId: 'u1', action: 'pause' })).toEqual({
      http: 200,
      body: { status: 'paused' },
    })
    expect(deps.claim).toHaveBeenCalledWith('u1', 'r1', 'write', 5)
    expect(deps.setStatus).toHaveBeenCalledWith('r1', 'paused')
  })

  it('refuses with action_throttled (429) and does not touch Mercado Pago', async () => {
    const deps = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'paused' })], error: null }),
      claim: vi.fn().mockResolvedValue({ data: false, error: null }),
    })
    expect(await runUserAction(deps, { userId: 'u1', action: 'reactivate' })).toEqual({
      http: 429,
      body: { error: 'action_throttled' },
    })
    expect(deps.mp).not.toHaveBeenCalled()
  })

  it('answers 404 without subscriptions and 409 for an impossible transition, before claiming', async () => {
    const none = makeDeps()
    expect((await runUserAction(none, { userId: 'u1', action: 'pause' })).http).toBe(404)
    const wrong = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'paused' })], error: null }),
    })
    expect(await runUserAction(wrong, { userId: 'u1', action: 'pause' })).toEqual({
      http: 409,
      body: { error: 'invalid_transition' },
    })
    expect(none.claim).not.toHaveBeenCalled()
    expect(wrong.claim).not.toHaveBeenCalled()
  })

  it('answers 500 when the claim fails and 502 when Mercado Pago refuses', async () => {
    const rows = { data: [row({ status: 'authorized' })], error: null }
    const claimFails = makeDeps({
      listRows: vi.fn().mockResolvedValue(rows),
      claim: vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000' } }),
    })
    expect((await runUserAction(claimFails, { userId: 'u1', action: 'pause' })).http).toBe(500)
    const refused = makeDeps({
      listRows: vi.fn().mockResolvedValue(rows),
      mp: vi.fn().mockResolvedValue({ status: 503, json: null }),
    })
    expect(await runUserAction(refused, { userId: 'u1', action: 'pause' })).toEqual({
      http: 502,
      body: { error: 'payment_provider_unavailable' },
    })
  })
})

describe('cancel', () => {
  const three = [
    row({
      id: 'a',
      preapproval_id: 'pre-a',
      status: 'authorized',
      created_at: '2026-11-01T10:00:00Z',
    }),
    row({
      id: 'p',
      preapproval_id: 'pre-p',
      status: 'pending',
      created_at: '2026-11-02T10:00:00Z',
    }),
    row({
      id: 'x',
      preapproval_id: 'pre-x',
      status: 'cancelled',
      created_at: '2026-10-01T10:00:00Z',
    }),
    row({ id: 'o', preapproval_id: null, status: 'pending', created_at: '2026-11-03T10:00:00Z' }),
  ]

  it('cancels every non-cancelled row on Mercado Pago and in the database', async () => {
    const deps = makeDeps({ listRows: vi.fn().mockResolvedValue({ data: three, error: null }) })
    expect(await runUserAction(deps, { userId: 'u1', action: 'cancel' })).toEqual({
      http: 200,
      body: { status: 'cancelled' },
    })
    expect(calls(deps.mp).map((c) => c[1])).toEqual([
      'https://api.mercadopago.com/preapproval/pre-a',
      'https://api.mercadopago.com/preapproval/pre-p',
    ])
    expect(calls(deps.setStatus).map((c) => c[0])).toEqual(['a', 'p', 'o'])
    expect(deps.claim).toHaveBeenCalledTimes(1)
  })

  it('keeps going when one cancel fails, and reports the failure', async () => {
    const mp = vi
      .fn()
      .mockImplementation(async (_m: string, url: string) =>
        url.endsWith('pre-a') ? { status: 500, json: null } : { status: 200, json: null },
      )
    const deps = makeDeps({ mp, listRows: vi.fn().mockResolvedValue({ data: three, error: null }) })
    expect(await runUserAction(deps, { userId: 'u1', action: 'cancel' })).toEqual({
      http: 502,
      body: { error: 'payment_provider_unavailable' },
    })
    expect(calls(deps.setStatus).map((c) => c[0])).toEqual(['p', 'o'])
  })

  it('is throttled like the other writes and is a 409 when everything is already cancelled', async () => {
    const throttled = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: three, error: null }),
      claim: vi.fn().mockResolvedValue({ data: false, error: null }),
    })
    expect((await runUserAction(throttled, { userId: 'u1', action: 'cancel' })).body).toEqual({
      error: 'action_throttled',
    })
    expect(throttled.mp).not.toHaveBeenCalled()
    const done = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: [row({ status: 'cancelled' })], error: null }),
    })
    expect((await runUserAction(done, { userId: 'u1', action: 'cancel' })).http).toBe(409)
  })

  it('retries once with the other spelling on a 400 and remembers it for later calls', async () => {
    const mp = vi
      .fn()
      .mockResolvedValueOnce({ status: 400, json: null })
      .mockResolvedValue({ status: 200, json: null })
    const one = [row({ id: 'a', status: 'authorized' })]
    const first = makeDeps({ mp, listRows: vi.fn().mockResolvedValue({ data: one, error: null }) })
    expect((await runUserAction(first, { userId: 'u1', action: 'cancel' })).http).toBe(200)
    expect(calls(mp).map((c) => c[2])).toEqual([{ status: 'canceled' }, { status: 'cancelled' }])

    const second = makeDeps({ listRows: vi.fn().mockResolvedValue({ data: one, error: null }) })
    await runUserAction(second, { userId: 'u1', action: 'cancel' })
    expect(calls(second.mp)).toEqual([
      ['PUT', 'https://api.mercadopago.com/preapproval/pre-r1', { status: 'cancelled' }],
    ])
  })

  it('never loops: two 400s fail the cancel with a provider error', async () => {
    const mp = vi.fn().mockResolvedValue({ status: 400, json: null })
    const deps = makeDeps({
      mp,
      listRows: vi.fn().mockResolvedValue({ data: [row({})], error: null }),
    })
    expect(await runUserAction(deps, { userId: 'u1', action: 'cancel' })).toEqual({
      http: 502,
      body: { error: 'payment_provider_error' },
    })
    expect(mp).toHaveBeenCalledTimes(2)
  })
})

describe('loading failures', () => {
  it('answers 500 when the rows cannot be loaded', async () => {
    const deps = makeDeps({
      listRows: vi.fn().mockResolvedValue({ data: null, error: { code: '57014' } }),
    })
    expect(await runUserAction(deps, { userId: 'u1', action: 'get' })).toEqual({
      http: 500,
      body: { error: 'server_error' },
    })
  })
})
