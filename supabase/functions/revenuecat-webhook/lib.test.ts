import { describe, expect, it } from 'vitest'
import { decideEvent, isSafeId, parseWebhookBody, timingSafeEqualStrings } from './lib.ts'

const USER_ID = '2f6c1b0a-9d3e-4a21-8b7a-0c5e6f1d2a33'

function event(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      id: 'evt-123',
      type: 'INITIAL_PURCHASE',
      app_user_id: USER_ID,
      expiration_at_ms: 1_800_000_000_000,
      ...overrides,
    },
  }
}

/** parseWebhookBody(event(...)) is never null for the fixtures in this file: this just avoids `!`. */
function parsedEvent(overrides: Record<string, unknown> = {}) {
  const parsed = parseWebhookBody(event(overrides))
  if (!parsed) throw new Error('expected event() to parse')
  return parsed
}

describe('timingSafeEqualStrings', () => {
  it('compares in constant time and rejects different lengths', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStrings('', '')).toBe(true)
  })
})

describe('isSafeId', () => {
  it('accepts the expected alphabet and rejects everything else', () => {
    expect(isSafeId('evt-123_ABC')).toBe(true)
    expect(isSafeId('has space')).toBe(false)
    expect(isSafeId('')).toBe(false)
    expect(isSafeId('a'.repeat(101))).toBe(false)
    expect(isSafeId(42)).toBe(false)
  })
})

describe('parseWebhookBody', () => {
  it('reads id, type, app_user_id and expiration_at_ms from event', () => {
    expect(parseWebhookBody(event())).toEqual({
      id: 'evt-123',
      type: 'INITIAL_PURCHASE',
      appUserId: USER_ID,
      expirationAtMs: 1_800_000_000_000,
    })
  })

  it('tolerates a missing app_user_id or expiration_at_ms (still returns the event)', () => {
    expect(parseWebhookBody(event({ app_user_id: undefined, expiration_at_ms: undefined }))).toEqual(
      { id: 'evt-123', type: 'INITIAL_PURCHASE', appUserId: null, expirationAtMs: null },
    )
  })

  it.each([null, undefined, 'garbage', {}, { event: null }, { event: { id: 'x' } }, { event: { type: 'X' } }])(
    'rejects an unusable body: %j',
    (body) => {
      expect(parseWebhookBody(body)).toBeNull()
    },
  )
})

describe('decideEvent', () => {
  it('grants for a renewal-shaped event, converting expiration_at_ms to an ISO string', () => {
    const decision = decideEvent(parsedEvent({ type: 'RENEWAL' }))
    expect(decision).toEqual({
      kind: 'grant',
      userId: USER_ID,
      eventId: 'evt-123',
      eventType: 'RENEWAL',
      expiresAtIso: new Date(1_800_000_000_000).toISOString(),
    })
  })

  it.each(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'])(
    'treats %s as an expiry-bearing event',
    (type) => {
      expect(decideEvent(parsedEvent({ type })).kind).toBe('grant')
    },
  )

  it('ignores a TEST event without touching anything', () => {
    expect(decideEvent(parsedEvent({ type: 'TEST' }))).toEqual({
      kind: 'ignore',
      reason: 'test_event',
    })
  })

  it('ignores a TRANSFER event as unsupported', () => {
    expect(decideEvent(parsedEvent({ type: 'TRANSFER' }))).toEqual({
      kind: 'ignore',
      reason: 'transfer_unsupported',
    })
  })

  it('ignores an unknown event type', () => {
    expect(decideEvent(parsedEvent({ type: 'SOMETHING_NEW' }))).toEqual({
      kind: 'ignore',
      reason: 'unsupported_type',
    })
  })

  it('flags a renewal-shaped event missing app_user_id or expiration_at_ms as unexpected_shape', () => {
    expect(decideEvent(parsedEvent({ app_user_id: undefined }))).toEqual({ kind: 'unexpected_shape' })
    expect(decideEvent(parsedEvent({ expiration_at_ms: undefined }))).toEqual({
      kind: 'unexpected_shape',
    })
  })

  it('flags a non-uuid app_user_id as unexpected_shape (RevenueCat app_user_id must be the Supabase user id)', () => {
    expect(decideEvent(parsedEvent({ app_user_id: 'not-a-uuid' }))).toEqual({
      kind: 'unexpected_shape',
    })
  })
})
