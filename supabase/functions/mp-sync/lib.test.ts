/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures index known-present mock calls */
import { describe, expect, it, vi } from 'vitest'
import {
  MpApiError,
  MpAuthError,
  MpInvalidGrantError,
  MpRateLimitError,
  MpServerError,
} from '../_shared/mpApi.ts'
import { rawPayment } from './fixtures.ts'
import {
  filterPayments,
  runSyncBatch,
  runUserSync,
  SyncStageError,
  verifyCronSecret,
  type SyncConnection,
  type SyncDeps,
} from './lib.ts'
import { normalizePayment, type MpPayment } from './mpFields.ts'

const NOW = new Date('2026-11-12T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

const conn = (over: Partial<SyncConnection> = {}): SyncConnection => ({
  userId: 'u1',
  mpUserId: '111',
  status: 'active',
  accessTokenEnc: 'enc-at',
  refreshTokenEnc: 'enc-rt',
  expiresAt: new Date(NOW.getTime() + 60 * DAY).toISOString(),
  cursorAt: '2026-11-10T12:00:00.000Z',
  importSince: '2026-11-01T00:00:00.000Z',
  ...over,
})

const pm = (over: Record<string, unknown> = {}): MpPayment => normalizePayment(rawPayment(over))!

function page(results: unknown[], total: number) {
  return { results, paging: { total } }
}

function makeDeps(over: Partial<SyncDeps> = {}) {
  const deps = {
    mp: {
      get: vi.fn(async (): Promise<unknown> => page([], 0)),
      refreshToken: vi.fn(async () => ({
        accessToken: 'AT-new',
        refreshToken: 'RT-new',
        expiresInSeconds: 15552000,
        mpUserId: '111',
      })),
    },
    now: () => NOW,
    sleep: vi.fn(async () => {}),
    random: () => 0,
    decrypt: vi.fn(async (_c: string, text: string) => text.replace('enc-', '')),
    encrypt: vi.fn(async (_c: string, text: string) => `enc-${text}`),
    persistTokens: vi.fn(async () => {}),
    findSeenIds: vi.fn(async () => new Set<string>()),
    categorize: vi.fn(async () => new Map<string, string | null>()),
    importPayments: vi.fn(async () => ({ posted: 0, voided: 0, skipped: 0, needsReview: 0, failed: 0 })),
    ...over,
  } as SyncDeps & {
    mp: { get: ReturnType<typeof vi.fn>; refreshToken: ReturnType<typeof vi.fn> }
    sleep: ReturnType<typeof vi.fn>
    persistTokens: ReturnType<typeof vi.fn>
    importPayments: ReturnType<typeof vi.fn>
    categorize: ReturnType<typeof vi.fn>
    findSeenIds: ReturnType<typeof vi.fn>
  }
  return deps
}

const run = (deps: SyncDeps, c = conn(), deadlineAt = NOW.getTime() + 100_000) =>
  runUserSync(deps, c, { deadlineAt })

describe('filterPayments (D10, R2.2)', () => {
  const ctx = { mpUserId: '111', importSince: null, seenIds: new Set<string>() }
  const ids = (list: MpPayment[]) => filterPayments(list, ctx).map((p) => p.paymentId)

  it('keeps an approved ARS payer-side regular payment', () => {
    expect(ids([pm()])).toEqual(['1001'])
  })
  it('drops other payers, inflows (collector = me), non-ARS and pending', () => {
    expect(ids([pm({ payer: { id: 999 } })])).toEqual([])
    expect(ids([pm({ collector: { id: 111 } })])).toEqual([])
    expect(ids([pm({ currency_id: 'USD' })])).toEqual([])
    expect(ids([pm({ status: 'pending' }), pm({ id: 2, status: 'in_process' })])).toEqual([])
  })
  it('keeps money_transfer, drops account_fund and unknown operation types', () => {
    expect(ids([pm({ operation_type: 'money_transfer' })])).toEqual(['1001'])
    expect(ids([pm({ operation_type: 'account_fund' })])).toEqual([])
  })
  it('recurring-only feed: approved recurring passes (subscription check), refunded recurring is dropped', () => {
    expect(ids([pm({ operation_type: 'recurring_payment' })])).toEqual(['1001'])
    expect(ids([pm({ operation_type: 'recurring_payment', status: 'refunded' })])).toEqual([])
  })
  it('passes void statuses only for payments already imported', () => {
    const refunded = pm({ status: 'refunded' })
    expect(ids([refunded])).toEqual([])
    expect(
      filterPayments([refunded], { ...ctx, seenIds: new Set(['1001']) }).map((p) => p.paymentId),
    ).toEqual(['1001'])
  })
  it('drops payments created before import_since and duplicates in the same list', () => {
    const since = new Date('2026-11-10T20:00:00.000Z')
    expect(filterPayments([pm()], { ...ctx, importSince: since })).toEqual([])
    expect(ids([pm(), pm()])).toEqual(['1001'])
  })
})

describe('runUserSync window, pagination and cursor (D9, D11)', () => {
  it('queries from cursor - 2 days to now and advances the cursor to the run end on success', async () => {
    const deps = makeDeps()
    const out = await run(deps)
    const query = deps.mp.get.mock.calls[0]![2] as Record<string, string>
    expect(query.begin_date).toBe('2026-11-08T12:00:00.000Z')
    expect(query.end_date).toBe(NOW.toISOString())
    expect(out).toMatchObject({ result: 'ok', errorClass: null, cursor: NOW.toISOString() })
  })

  it('falls back to import_since when there is no cursor', async () => {
    const deps = makeDeps()
    await run(deps, conn({ cursorAt: null }))
    const query = deps.mp.get.mock.calls[0]![2] as Record<string, string>
    expect(query.begin_date).toBe('2026-10-30T00:00:00.000Z')
  })

  it('pages with offset until total is reached and imports each page once', async () => {
    const p1 = Array.from({ length: 50 }, (_, i) => rawPayment({ id: 1000 + i }))
    const p2 = Array.from({ length: 10 }, (_, i) => rawPayment({ id: 2000 + i }))
    const deps = makeDeps({
      mp: {
        get: vi.fn(async (_p: string, _t: string, q?: Record<string, string>) =>
          q?.offset === '0' ? page(p1, 60) : page(p2, 60),
        ),
        refreshToken: vi.fn(),
      } as never,
    })
    const out = await run(deps)
    expect(deps.mp.get).toHaveBeenCalledTimes(2)
    expect(deps.importPayments).toHaveBeenCalledTimes(2)
    expect(out.result).toBe('ok')
  })

  it('does not advance the cursor on a partial run (import failure counted)', async () => {
    const deps = makeDeps({
      mp: { get: vi.fn(async () => page([rawPayment()], 1)), refreshToken: vi.fn() } as never,
      importPayments: vi.fn(async () => ({ posted: 0, voided: 0, skipped: 0, needsReview: 0, failed: 1 })),
    })
    const out = await run(deps)
    expect(out).toMatchObject({ result: 'partial', errorClass: 'unexpected', cursor: null })
  })

  it('page cap hit -> halves the window until a smaller window completes; cursor = that end', async () => {
    const full = Array.from({ length: 50 }, (_, i) => rawPayment({ id: i + 1 }))
    const seenEnds: string[] = []
    const deps = makeDeps({
      mp: {
        get: vi.fn(async (_p: string, _t: string, q?: Record<string, string>) => {
          const end = q!.end_date!
          if (!seenEnds.includes(end)) seenEnds.push(end)
          // The full window never finishes (total is huge); the first halving does.
          return seenEnds.length < 2 ? page(full, 100_000) : page([], 0)
        }),
        refreshToken: vi.fn(),
      } as never,
    })
    const out = await run(deps, conn({ cursorAt: '2026-11-04T12:00:00.000Z' }))
    expect(seenEnds[0]).toBe(NOW.toISOString())
    const from = new Date('2026-11-02T12:00:00.000Z').getTime()
    expect(new Date(seenEnds[1]!).getTime()).toBe(from + (NOW.getTime() - from) / 2)
    expect(out.result).toBe('ok')
    expect(out.cursor).toBe(seenEnds[1])
    // 20 pages max per attempt
    expect(deps.mp.get.mock.calls.filter((c) => (c[2] as Record<string, string>).end_date === seenEnds[0])).toHaveLength(20)
  })

  it('error 1000 halves the window as well', async () => {
    const tooLarge = new MpApiError(400)
    tooLarge.mpCode = '1000'
    const get = vi.fn(async (_p: string, _t: string, q?: Record<string, string>) => {
      if (q!.end_date === NOW.toISOString()) throw tooLarge
      return page([], 0)
    })
    const deps = makeDeps({ mp: { get, refreshToken: vi.fn() } as never })
    const out = await run(deps, conn({ cursorAt: '2026-11-04T12:00:00.000Z' }))
    expect(out.result).toBe('ok')
    expect(out.cursor).toBe('2026-11-07T12:00:00.000Z')
  })

  it('a window of <= 4 days that stays too large drops the overlap so the cursor still moves forward', async () => {
    const tooLarge = new MpApiError(400)
    tooLarge.mpCode = '1000'
    const cursor = new Date('2026-11-10T12:00:00.000Z')
    const get = vi.fn(async (_p: string, _t: string, q?: Record<string, string>) => {
      const begin = new Date(q!.begin_date!).getTime()
      const end = new Date(q!.end_date!).getTime()
      // The overlap region alone is too dense: only windows that start at the cursor and span <= 1 day succeed.
      if (begin < cursor.getTime() || end - begin > DAY) throw tooLarge
      return page([], 0)
    })
    const deps = makeDeps({ mp: { get, refreshToken: vi.fn() } as never })
    const out = await run(deps, conn({ cursorAt: cursor.toISOString() }))
    expect(out.result).toBe('ok')
    expect(out.cursor).toBe('2026-11-11T12:00:00.000Z')
  })

  it('never returns a cursor behind the stored one', async () => {
    const tooLarge = new MpApiError(400)
    tooLarge.mpCode = '1000'
    const cursor = new Date('2026-11-10T12:00:00.000Z')
    const get = vi.fn(async (_p: string, _t: string, q?: Record<string, string>) => {
      if (new Date(q!.end_date!).getTime() > cursor.getTime() + 3 * 60 * 60 * 1000) throw tooLarge
      return page([], 0)
    })
    const deps = makeDeps({ mp: { get, refreshToken: vi.fn() } as never })
    const out = await run(deps, conn({ cursorAt: cursor.toISOString() }))
    expect(out.result).toBe('ok')
    expect(new Date(out.cursor!).getTime()).toBeGreaterThan(cursor.getTime())
  })

  it('a window that cannot shrink any further is a partial run', async () => {
    const tooLarge = new MpApiError(400)
    tooLarge.mpCode = '1000'
    const deps = makeDeps({ mp: { get: vi.fn(async () => { throw tooLarge }), refreshToken: vi.fn() } as never })
    const out = await run(deps)
    expect(out).toMatchObject({ result: 'partial', cursor: null })
  })

  it('stops with a partial result when the deadline passes', async () => {
    const deps = makeDeps()
    const out = await run(deps, conn(), NOW.getTime() - 1)
    expect(out).toMatchObject({ result: 'partial', cursor: null })
    expect(deps.mp.get).not.toHaveBeenCalled()
  })

  it('sends only the filtered payments to the import RPC with the chosen category', async () => {
    const deps = makeDeps({
      mp: {
        get: vi.fn(async () => page([rawPayment(), rawPayment({ id: 2, payer: { id: 9 } })], 2)),
        refreshToken: vi.fn(),
      } as never,
      categorize: vi.fn(async () => new Map([['1001', 'cat-1']])),
    })
    await run(deps)
    const rows = deps.importPayments.mock.calls[0]![0] as Record<string, unknown>[]
    expect(rows).toEqual([
      {
        payment_id: '1001',
        status: 'approved',
        operation_type: 'regular_payment',
        amount: 1500.5,
        date_approved: '2026-11-10T15:00:00.000-03:00',
        date_created: '2026-11-10T14:59:00.000-03:00',
        merchant: 'Cafe Martinez',
        category_id: 'cat-1',
      },
    ])
  })

  it('categorizes only NEW approved regular payments (not seen, not recurring)', async () => {
    const deps = makeDeps({
      mp: {
        get: vi.fn(async () =>
          page(
            [rawPayment({ id: 1 }), rawPayment({ id: 2 }), rawPayment({ id: 3, operation_type: 'recurring_payment' })],
            3,
          ),
        ),
        refreshToken: vi.fn(),
      } as never,
      findSeenIds: vi.fn(async () => new Set(['2'])),
    })
    await run(deps)
    const items = deps.categorize.mock.calls[0]![0] as { paymentId: string }[]
    expect(items.map((i) => i.paymentId)).toEqual(['1'])
  })

  it('never sends the free text of a money_transfer to the model (it may carry a name or a note)', async () => {
    const transfer = (id: number) => rawPayment({ id, operation_type: 'money_transfer', description: 'Para Juan Perez' })
    const deps = makeDeps({
      mp: { get: vi.fn(async () => page([rawPayment({ id: 1 }), transfer(2)], 2)), refreshToken: vi.fn() } as never,
      categorize: vi.fn(async () => new Map<string, string | null>([['1', 'cat-1'], ['2', 'cat-leak']])),
    })
    await run(deps)
    const items = deps.categorize.mock.calls[0]![0] as { paymentId: string; merchant: string }[]
    expect(items.map((i) => i.paymentId)).toEqual(['1'])
    expect(JSON.stringify(deps.categorize.mock.calls)).not.toContain('Juan')
    const rows = deps.importPayments.mock.calls[0]![0] as { payment_id: string; category_id?: string }[]
    // The transfer goes to the RPC without a model-chosen category (the RPC falls back).
    expect(rows.find((r) => r.payment_id === '2')!.category_id).toBeUndefined()
  })

  it('a page with only transfers makes no categorize call at all', async () => {
    const deps = makeDeps({
      mp: {
        get: vi.fn(async () => page([rawPayment({ id: 5, operation_type: 'money_transfer' })], 1)),
        refreshToken: vi.fn(),
      } as never,
    })
    await run(deps)
    expect(deps.categorize).not.toHaveBeenCalled()
    expect(deps.importPayments).toHaveBeenCalledTimes(1)
  })

  it('a categorizer crash never fails the import (fallback)', async () => {
    const deps = makeDeps({
      mp: { get: vi.fn(async () => page([rawPayment()], 1)), refreshToken: vi.fn() } as never,
      categorize: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const out = await run(deps)
    expect(out.result).toBe('ok')
    expect((deps.importPayments.mock.calls[0]![0] as { category_id?: unknown }[])[0]!.category_id).toBeUndefined()
  })

  it('maps import RPC stage errors to their error class', async () => {
    const deps = makeDeps({
      mp: { get: vi.fn(async () => page([rawPayment()], 1)), refreshToken: vi.fn() } as never,
      importPayments: vi.fn(async () => {
        throw new SyncStageError('account_unavailable')
      }),
    })
    expect(await run(deps)).toMatchObject({ result: 'error', errorClass: 'account_unavailable', cursor: null })
  })
})

describe('runUserSync backoff and token handling (D12, D13)', () => {
  it('429: retries with 1s/2s/4s backoff then stops as rate_limited (partial)', async () => {
    const get = vi.fn(async () => {
      throw new MpRateLimitError(null)
    })
    const deps = makeDeps({ mp: { get, refreshToken: vi.fn() } as never })
    const out = await run(deps)
    expect(deps.sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000])
    expect(get).toHaveBeenCalledTimes(4)
    expect(out).toMatchObject({ result: 'partial', errorClass: 'rate_limited', cursor: null })
  })

  it('429 then success continues', async () => {
    let n = 0
    const get = vi.fn(async () => {
      if (n++ === 0) throw new MpRateLimitError(null)
      return page([], 0)
    })
    const out = await run(makeDeps({ mp: { get, refreshToken: vi.fn() } as never }))
    expect(out.result).toBe('ok')
  })

  it('5xx is transient: two retries then partial mp_unavailable', async () => {
    const get = vi.fn(async () => {
      throw new MpServerError(503)
    })
    const deps = makeDeps({ mp: { get, refreshToken: vi.fn() } as never })
    const out = await run(deps)
    expect(get).toHaveBeenCalledTimes(3)
    expect(out).toMatchObject({ result: 'partial', errorClass: 'mp_unavailable' })
  })

  it('error 2001 skips the run without retrying', async () => {
    const e = new MpApiError(400)
    e.mpCode = '2001'
    const get = vi.fn(async () => {
      throw e
    })
    const out = await run(makeDeps({ mp: { get, refreshToken: vi.fn() } as never }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(out).toMatchObject({ result: 'partial', errorClass: 'mp_unavailable' })
  })

  it('401 -> one refresh (rotated token persisted BEFORE use) -> retry succeeds', async () => {
    const order: string[] = []
    let n = 0
    const get = vi.fn(async (_p: string, token: string) => {
      order.push(`get:${token}`)
      if (n++ === 0) throw new MpAuthError()
      return page([], 0)
    })
    const deps = makeDeps({
      mp: {
        get,
        refreshToken: vi.fn(async (rt: string) => {
          order.push(`refresh:${rt}`)
          return { accessToken: 'AT-new', refreshToken: 'RT-new', expiresInSeconds: 100, mpUserId: '111' }
        }),
      } as never,
      persistTokens: vi.fn(async () => {
        order.push('persist')
      }),
    })
    const out = await run(deps)
    expect(order).toEqual(['get:at', 'refresh:rt', 'persist', 'get:AT-new'])
    expect(deps.persistTokens).toHaveBeenCalledWith({
      accessTokenEnc: 'enc-AT-new',
      refreshTokenEnc: 'enc-RT-new',
      expiresAt: new Date(NOW.getTime() + 100_000).toISOString(),
    })
    expect(out.result).toBe('ok')
  })

  it('401 again after the refresh -> token_invalid (needs_reconnect)', async () => {
    const get = vi.fn(async () => {
      throw new MpAuthError()
    })
    const deps = makeDeps({ mp: { get, refreshToken: deps0().mp.refreshToken } as never })
    const out = await run(deps)
    expect(get).toHaveBeenCalledTimes(2)
    expect(out).toMatchObject({ result: 'error', errorClass: 'token_invalid', cursor: null })
  })

  it('refreshes proactively when the token expires within 7 days', async () => {
    const deps = makeDeps()
    await run(deps, conn({ expiresAt: new Date(NOW.getTime() + 3 * DAY).toISOString() }))
    expect(deps.mp.refreshToken).toHaveBeenCalledWith('rt')
    expect(deps.mp.get.mock.calls[0]![1]).toBe('AT-new')
  })

  it('invalid_grant on refresh -> token_invalid and no API call', async () => {
    const deps = makeDeps({
      mp: {
        get: vi.fn(),
        refreshToken: vi.fn(async () => {
          throw new MpInvalidGrantError()
        }),
      } as never,
    })
    const out = await run(deps, conn({ expiresAt: new Date(NOW.getTime() + DAY).toISOString() }))
    expect(out).toMatchObject({ result: 'error', errorClass: 'token_invalid' })
    expect(deps.mp.get).not.toHaveBeenCalled()
  })

  it('if the rotated token cannot be persisted, the new access token is never used', async () => {
    const deps = makeDeps({
      persistTokens: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    const out = await run(deps, conn({ expiresAt: new Date(NOW.getTime() + DAY).toISOString() }))
    expect(out).toMatchObject({ result: 'error', errorClass: 'unexpected' })
    expect(deps.mp.get).not.toHaveBeenCalled()
  })

  it('a decrypt failure is a config error and never reaches MP', async () => {
    const deps = makeDeps({
      decrypt: vi.fn(async () => {
        throw new Error('bad key')
      }),
    })
    const out = await run(deps)
    expect(out).toMatchObject({ result: 'error', errorClass: 'config' })
    expect(deps.mp.get).not.toHaveBeenCalled()
  })

  it('logs nothing sensitive', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const get = vi.fn(async () => {
      throw new MpServerError(503)
    })
    await run(makeDeps({ mp: { get, refreshToken: vi.fn() } as never }))
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('enc-at')
    expect(logged).not.toContain('AT-new')
    spy.mockRestore()
  })
})

function deps0() {
  return makeDeps()
}

describe('runSyncBatch (D18, R4.1)', () => {
  const outcome = { result: 'ok', errorClass: null, cursor: NOW.toISOString() } as const
  it('skips non-active connections, finishes the rest and isolates a crash', async () => {
    const finish = vi.fn(async () => {})
    const runOne = vi.fn(async (c: SyncConnection) => {
      if (c.userId === 'boom') throw new Error('x')
      return outcome
    })
    const summary = await runSyncBatch(
      { run: runOne, finish, nowMs: () => NOW.getTime() },
      [
        conn({ userId: 'ok' }),
        conn({ userId: 'lapsed', status: 'plus_lapsed' }),
        conn({ userId: 'recon', status: 'needs_reconnect' }),
        conn({ userId: 'boom' }),
      ],
      NOW.getTime() + 1000,
    )
    expect(runOne).toHaveBeenCalledTimes(2)
    expect(finish).toHaveBeenCalledWith('ok', outcome)
    expect(finish).toHaveBeenCalledWith('boom', { result: 'error', errorClass: 'unexpected', cursor: null })
    expect(summary).toEqual({ processed: 2, skipped: 2, deferred: 0 })
  })

  it('defers connections that are claimed after the deadline', async () => {
    const runOne = vi.fn(async () => outcome)
    const summary = await runSyncBatch(
      { run: runOne, finish: vi.fn(), nowMs: () => NOW.getTime() + 5000 },
      [conn()],
      NOW.getTime(),
    )
    expect(runOne).not.toHaveBeenCalled()
    expect(summary.deferred).toBe(1)
  })
})

describe('verifyCronSecret', () => {
  it('accepts only the exact secret and rejects empty/missing', async () => {
    expect(await verifyCronSecret('s3cret-value', 's3cret-value')).toBe(true)
    expect(await verifyCronSecret('s3cret-valuX', 's3cret-value')).toBe(false)
    expect(await verifyCronSecret(null, 's3cret-value')).toBe(false)
    expect(await verifyCronSecret('', '')).toBe(false)
    expect(await verifyCronSecret('x', undefined)).toBe(false)
  })
})
