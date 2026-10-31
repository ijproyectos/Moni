/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures index known-present mock calls */
import { describe, expect, it, vi } from 'vitest'
import { MpAuthError, MpRateLimitError } from '../_shared/mpApi.ts'
import { buildVariants, describePayment, runDebugSearch, type DebugDeps } from './debug.ts'
import { rawPayment } from './fixtures.ts'
import { type SyncConnection } from './lib.ts'

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

function makeDeps(get: DebugDeps['mp']['get'] = async () => ({ results: [], paging: { total: 0 } })) {
  return {
    mp: {
      get: vi.fn(get),
      refreshToken: vi.fn(async () => ({
        accessToken: 'AT-new',
        refreshToken: 'RT-new',
        expiresInSeconds: 100,
        mpUserId: '111',
      })),
    },
    now: () => NOW,
    decrypt: vi.fn(async (_c: string, text: string) => text.replace('enc-', '')),
    encrypt: vi.fn(async (_c: string, text: string) => `enc-${text}`),
    persistTokens: vi.fn(async () => {}),
  }
}

describe('buildVariants', () => {
  const v = buildVariants('111', NOW)
  it('builds V1..V5 with limit 10 and the documented params', () => {
    expect(v.map((x) => x.name)).toHaveLength(5)
    expect(v.every((x) => x.query.limit === '10')).toBe(true)
    expect(v[0]!.query).toMatchObject({ range: 'date_last_updated', begin_date: '2026-11-05T12:00:00.000Z' })
    expect(v[0]!.query['payer.id']).toBeUndefined()
    expect(v[1]!.query).toMatchObject({ ...v[0]!.query, 'payer.id': '111' })
    expect(v[2]!.query).toEqual({ sort: 'date_created', criteria: 'desc', limit: '10' })
    expect(v[3]!.query).toEqual({ ...v[2]!.query, 'collector.id': '111' })
    expect(v[4]!.query).toEqual({ ...v[2]!.query, 'payer.id': '111' })
  })
})

describe('describePayment', () => {
  it('reports booleans and key names, never ids or values', () => {
    const d = describePayment(rawPayment({ status_detail: 'accredited', collector_id: undefined }), '111')
    expect(d).toMatchObject({
      operation_type: 'regular_payment',
      status: 'approved',
      status_detail: 'accredited',
      currency_id: 'ARS',
      point_of_interaction_type: 'PIX',
      payer_id_is_me: true,
      collector_id_is_me: false,
      payer_id_present: true,
      collector_id_present: true,
      payer_keys: ['email', 'id'],
      collector_keys: ['id'],
    })
  })
  it('drops non enum-like strings', () => {
    expect(describePayment(rawPayment({ status: 'Juan Perez <a@b.c>' }), '111').status).toBeNull()
  })
})

describe('runDebugSearch', () => {
  it('runs five variants, reports shape and never leaks sensitive values', async () => {
    const secret = rawPayment({
      id: 987654321,
      description: 'SECRET-DESC',
      statement_descriptor: 'SECRET-STMT',
      transaction_amount: 4242.42,
      payer: { id: 111, email: 'leak@example.com', first_name: 'SECRETNAME' },
      collector: { id: 777222 },
    })
    const deps = makeDeps(async () => ({ results: [secret], paging: { total: 1 } }))
    const report = await runDebugSearch(deps, conn())
    expect(deps.mp.get).toHaveBeenCalledTimes(5)
    expect(deps.persistTokens).not.toHaveBeenCalled()
    expect(report.ok).toBe(true)
    expect(report.variants[0]).toMatchObject({
      http_status: 200,
      paging_total: 1,
      results_length: 1,
      first_result_keys: expect.arrayContaining(['id', 'payer']) as string[],
    })
    expect(report.variants[1]!.query_params).toContain('payer.id')
    expect(report.stats).toMatchObject({ fetched: 1, kept: 1 })
    const text = JSON.stringify(report)
    for (const forbidden of [
      '987654321',
      'SECRET-DESC',
      'SECRET-STMT',
      '4242',
      'leak@example.com',
      'SECRETNAME',
      '777222',
      'AT-new',
      'enc-at',
      'enc-rt',
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('does not refresh a valid token; refreshes and persists the rotated one when expired', async () => {
    const valid = makeDeps()
    await runDebugSearch(valid, conn())
    expect(valid.mp.refreshToken).not.toHaveBeenCalled()

    const expired = makeDeps()
    const report = await runDebugSearch(expired, conn({ expiresAt: new Date(NOW.getTime() - 1000).toISOString() }))
    expect(report.refreshed).toBe(true)
    expect(expired.mp.refreshToken).toHaveBeenCalledWith('rt')
    expect(expired.persistTokens).toHaveBeenCalledWith(
      expect.objectContaining({ refreshTokenEnc: 'enc-RT-new', accessTokenEnc: 'enc-AT-new' }),
    )
    expect(expired.mp.get.mock.calls[0]![1]).toBe('AT-new')
  })

  it('reports per-variant error class and status without stopping', async () => {
    let n = 0
    const deps = makeDeps(async () => {
      n++
      if (n === 1) throw new MpAuthError()
      if (n === 2) throw new MpRateLimitError(null)
      return { results: [], paging: { total: 0 } }
    })
    const report = await runDebugSearch(deps, conn())
    expect(report.variants[0]).toMatchObject({ http_status: 401, error: { class: 'MpAuthError' } })
    expect(report.variants[1]).toMatchObject({ http_status: 429, error: { class: 'MpRateLimitError' } })
    expect(report.variants[2]).toMatchObject({ http_status: 200, error: null, results_length: 0 })
  })

  it('fails closed when the token cannot be opened', async () => {
    const deps = makeDeps()
    deps.decrypt.mockRejectedValue(new Error('boom'))
    const report = await runDebugSearch(deps, conn())
    expect(report).toMatchObject({ ok: false, error: 'token_unavailable' })
    expect(deps.mp.get).not.toHaveBeenCalled()
  })
})
