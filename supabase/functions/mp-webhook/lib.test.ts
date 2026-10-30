import { describe, expect, it } from 'vitest'
import {
  type AuthorizedPaymentInfo,
  buildManifest,
  classifyMpFetch,
  computeSignature,
  decidePayment,
  httpStatusFor,
  isFreshTimestamp,
  isSafeId,
  parseAuthorizedPayment,
  parseNotification,
  parsePreapprovalResource,
  parseSignatureHeader,
  supportedTopic,
  planDuplicates,
  TIMESTAMP_FUTURE_SKEW_MS,
  TIMESTAMP_TOLERANCE_MS,
  timingSafeEqualStrings,
  verifyWebhookSignature,
} from './lib.ts'

// Independent vector: HMAC-SHA256 computed with Python's hmac module (not with this code).
//   hmac.new(b'test-secret', b'id:123456;request-id:req-abc-1;ts:1742505638683;', sha256).hexdigest()
const SECRET = 'test-secret'
const TS = '1742505638683'
const V1 = 'fe15c13439e6a715dcb123a6b72c020796fc2048ca3d26a666ac3e9f2f459af6'
const NOW = 1742505638683 + 60_000

describe('manifest and signature', () => {
  it('builds the manifest exactly as the mp-webhooks skill documents it', () => {
    expect(buildManifest('123456', 'req-abc-1', TS)).toBe(
      'id:123456;request-id:req-abc-1;ts:1742505638683;',
    )
  })

  it('computes the known HMAC-SHA256 vector', async () => {
    expect(await computeSignature(SECRET, buildManifest('123456', 'req-abc-1', TS))).toBe(V1)
  })

  it('parses ts and v1 from the header, in any order and with spaces', () => {
    expect(parseSignatureHeader(`ts=${TS},v1=${V1}`)).toEqual({ ts: TS, v1: V1 })
    expect(parseSignatureHeader(` v1=${V1.toUpperCase()} , ts=${TS}`)).toEqual({ ts: TS, v1: V1 })
  })

  it.each([null, '', 'garbage', `ts=${TS}`, `v1=${V1}`, `ts=abc,v1=${V1}`, `ts=${TS},v1=zz`])(
    'rejects a malformed header: %s',
    (header) => {
      expect(parseSignatureHeader(header)).toBeNull()
    },
  )

  it('compares in constant time and rejects different lengths', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false)
  })
})

describe('verifyWebhookSignature', () => {
  const base = {
    secret: SECRET,
    signatureHeader: `ts=${TS},v1=${V1}`,
    requestId: 'req-abc-1',
    dataIds: ['123456'] as (string | null)[],
    nowMs: NOW,
  }

  it('accepts a valid signature and returns the data id that matched', async () => {
    expect(await verifyWebhookSignature(base)).toEqual({ ok: true, dataId: '123456' })
  })

  it('tries each candidate id and picks the one the signature covers', async () => {
    expect(await verifyWebhookSignature({ ...base, dataIds: ['999', '123456'] })).toEqual({
      ok: true,
      dataId: '123456',
    })
  })

  it('rejects a wrong secret, a wrong id and a wrong request id', async () => {
    expect(await verifyWebhookSignature({ ...base, secret: 'other' })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(await verifyWebhookSignature({ ...base, dataIds: ['654321'] })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(await verifyWebhookSignature({ ...base, requestId: 'req-other' })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('rejects missing pieces without computing anything', async () => {
    for (const patch of [
      { signatureHeader: null },
      { requestId: null },
      { dataIds: [null, null] },
    ]) {
      expect(await verifyWebhookSignature({ ...base, ...patch })).toEqual({
        ok: false,
        reason: 'missing',
      })
    }
  })

  it('rejects a malformed header', async () => {
    expect(await verifyWebhookSignature({ ...base, signatureHeader: 'nope' })).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('rejects a stale timestamp even when the signature is otherwise valid', async () => {
    const stale = Number(TS) + TIMESTAMP_TOLERANCE_MS + 1
    expect(await verifyWebhookSignature({ ...base, nowMs: stale })).toEqual({
      ok: false,
      reason: 'stale',
    })
  })

  it('accepts a retry that reuses a 23 hour old signature', async () => {
    const later = Number(TS) + 23 * 60 * 60 * 1000
    expect(await verifyWebhookSignature({ ...base, nowMs: later })).toEqual({
      ok: true,
      dataId: '123456',
    })
  })

  it('rejects a future-dated timestamp beyond the skew', async () => {
    const early = Number(TS) - TIMESTAMP_FUTURE_SKEW_MS - 1
    expect(await verifyWebhookSignature({ ...base, nowMs: early })).toEqual({
      ok: false,
      reason: 'stale',
    })
  })
})

describe('isFreshTimestamp', () => {
  it('uses a 24 hour age window and a 5 minute future skew', () => {
    expect(TIMESTAMP_TOLERANCE_MS).toBe(24 * 60 * 60 * 1000)
    expect(TIMESTAMP_FUTURE_SKEW_MS).toBe(5 * 60 * 1000)
  })

  it('accepts a retry up to 24 hours old and a small future skew', () => {
    expect(isFreshTimestamp(TS, Number(TS))).toBe(true)
    expect(isFreshTimestamp(TS, Number(TS) + TIMESTAMP_TOLERANCE_MS)).toBe(true)
    expect(isFreshTimestamp(TS, Number(TS) - TIMESTAMP_FUTURE_SKEW_MS)).toBe(true)
  })

  it('rejects older than 24 hours, future-dated beyond the skew, and nonsense', () => {
    expect(isFreshTimestamp(TS, Number(TS) + TIMESTAMP_TOLERANCE_MS + 1)).toBe(false)
    expect(isFreshTimestamp(TS, Number(TS) - TIMESTAMP_FUTURE_SKEW_MS - 1)).toBe(false)
    expect(isFreshTimestamp(TS, Number(TS) - 60 * 60 * 1000)).toBe(false)
    expect(isFreshTimestamp('0', NOW)).toBe(false)
    expect(isFreshTimestamp('abc', NOW)).toBe(false)
  })

  it('reads a seconds timestamp', () => {
    expect(isFreshTimestamp('1742505638', 1742505638 * 1000 + 1000)).toBe(true)
  })
})

describe('notification parsing', () => {
  it('reads type and data.id (string or number)', () => {
    expect(parseNotification({ type: 'subscription_preapproval', data: { id: 'abc123' } })).toEqual(
      {
        type: 'subscription_preapproval',
        dataId: 'abc123',
      },
    )
    expect(parseNotification({ type: 'x', data: { id: 42 } }).dataId).toBe('42')
  })

  it('returns nulls for anything else', () => {
    for (const body of [
      null,
      'x',
      [],
      {},
      { data: 5 },
      { data: { id: {} } },
      { data: { id: -1 } },
    ]) {
      expect(parseNotification(body).dataId).toBeNull()
    }
  })

  it('only supports the two subscription topics', () => {
    expect(supportedTopic('subscription_preapproval')).toBe('subscription_preapproval')
    expect(supportedTopic('subscription_authorized_payment')).toBe(
      'subscription_authorized_payment',
    )
    expect(supportedTopic('payment')).toBeNull()
    expect(supportedTopic(undefined)).toBeNull()
  })

  it('only lets URL-safe ids through', () => {
    expect(isSafeId('2c93808484a7e0a40184c3d6a4a50a53')).toBe(true)
    expect(isSafeId('../../etc')).toBe(false)
    expect(isSafeId('a/b')).toBe(false)
    expect(isSafeId('')).toBe(false)
  })
})

describe('resources', () => {
  it('parses a preapproval and checks its terms against the offer', () => {
    const ok = parsePreapprovalResource({
      id: 'pre1',
      status: 'authorized',
      external_reference: 'ref-1',
      auto_recurring: { transaction_amount: 2999, currency_id: 'ARS' },
    })
    expect(ok).toEqual({
      id: 'pre1',
      status: 'authorized',
      externalReference: 'ref-1',
      matchesOffer: true,
    })
    const cheaper = parsePreapprovalResource({
      id: 'pre1',
      status: 'authorized',
      auto_recurring: { transaction_amount: 1, currency_id: 'ARS' },
    })
    expect(cheaper?.matchesOffer).toBe(false)
    expect(parsePreapprovalResource({ id: 'pre1', status: 'pending' })?.matchesOffer).toBeNull()
    expect(parsePreapprovalResource({ status: 'pending' })).toBeNull()
  })

  it('maps both spellings of cancelled and unknown statuses', () => {
    expect(parsePreapprovalResource({ id: 'a', status: 'canceled' })?.status).toBe('cancelled')
    expect(parsePreapprovalResource({ id: 'a', status: 'cancelled' })?.status).toBe('cancelled')
    expect(parsePreapprovalResource({ id: 'a', status: 'weird' })?.status).toBeNull()
  })

  const parse = (value: unknown) => parseAuthorizedPayment(value) as AuthorizedPaymentInfo

  const approved = {
    preapproval_id: 'pre1',
    transaction_amount: 2999,
    currency_id: 'ARS',
    payment: { id: 777, status: 'approved' },
  }

  it('grants for an approved payment of exactly the offer', () => {
    const info = parse(approved)
    expect(decidePayment(info)).toEqual({
      kind: 'grant',
      preapprovalId: 'pre1',
      paymentId: '777',
      amount: 2999,
    })
  })

  it('ignores payments that are not approved', () => {
    for (const payment of [
      { id: 1, status: 'pending' },
      { id: 1, status: 'rejected' },
      undefined,
    ]) {
      expect(decidePayment(parse({ ...approved, payment }))).toEqual({
        kind: 'ignore',
        reason: 'not_approved',
      })
    }
  })

  it('ignores a wrong amount or currency, whatever the status says', () => {
    for (const patch of [
      { transaction_amount: 2998.99 },
      { transaction_amount: 1 },
      { currency_id: 'USD' },
    ]) {
      expect(decidePayment(parse({ ...approved, ...patch }))).toEqual({
        kind: 'ignore',
        reason: 'amount_mismatch',
      })
    }
  })

  it('flags an approved payment with an unreadable shape instead of dropping it', () => {
    for (const patch of [
      { preapproval_id: undefined },
      { transaction_amount: '2999' },
      { currency_id: undefined },
      { payment: { status: 'approved' } },
    ]) {
      expect(decidePayment(parse({ ...approved, ...patch }))).toEqual({
        kind: 'unexpected_shape',
      })
    }
    expect(parseAuthorizedPayment('nope')).toBeNull()
  })
})

describe('planDuplicates (double billing defense)', () => {
  const at = (id: string, created_at: string, preapproval_id: string | null = `pre-${id}`) => ({
    id,
    created_at,
    preapproval_id,
  })
  const older = at('A', '2026-11-01T10:00:00Z')
  const newer = at('B', '2026-11-02T10:00:00Z')

  it('does nothing when the subject is the only authorized subscription', () => {
    expect(planDuplicates(older, [])).toEqual({ cancelSubject: false, cancelOthers: [] })
    expect(planDuplicates(older, [older])).toEqual({ cancelSubject: false, cancelOthers: [] })
  })

  it('flags the subject as the duplicate when an older one is already authorized', () => {
    expect(planDuplicates(newer, [older])).toEqual({ cancelSubject: true, cancelOthers: [] })
    expect(planDuplicates(newer, [older, newer])).toEqual({ cancelSubject: true, cancelOthers: [] })
  })

  it('keeps the subject and cancels the newer authorized ones', () => {
    expect(planDuplicates(older, [newer])).toEqual({ cancelSubject: false, cancelOthers: [newer] })
  })

  it('breaks a created_at tie by id so exactly one side wins', () => {
    const x = at('X', '2026-11-01T10:00:00Z')
    const y = at('Y', '2026-11-01T10:00:00Z')
    expect(planDuplicates(x, [y]).cancelSubject).toBe(false)
    expect(planDuplicates(y, [x]).cancelSubject).toBe(true)
  })
})

describe('error classification', () => {
  it('maps re-fetch statuses', () => {
    expect(classifyMpFetch(200)).toBe('ok')
    for (const s of [0, 404, 408, 429, 500, 503]) expect(classifyMpFetch(s)).toBe('transient')
    for (const s of [401, 403]) expect(classifyMpFetch(s)).toBe('config')
    expect(classifyMpFetch(400)).toBe('permanent')
  })

  it('answers 2xx to stop retries and 5xx to get them', () => {
    expect(httpStatusFor('handled')).toBe(200)
    expect(httpStatusFor('ignored')).toBe(200)
    expect(httpStatusFor('transient')).toBe(503)
    expect(httpStatusFor('config')).toBe(500)
  })
})
