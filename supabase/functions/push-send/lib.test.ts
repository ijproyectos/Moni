import { describe, expect, it } from 'vitest'
import {
  buildPayload,
  isGone,
  isRelativePath,
  parsePushRequest,
  sendToAll,
  verifyPushSecret,
  type PushSubscriptionRow,
} from './lib'

const UID = '11111111-1111-1111-1111-111111111111'
const valid = {
  kind: 'maintenance',
  title: 'Mantenimiento',
  body: 'Volvemos en 10 minutos',
  audience: 'all',
}

describe('verifyPushSecret', () => {
  it('accepts only the exact secret', async () => {
    expect(await verifyPushSecret('s3cret', 's3cret')).toBe(true)
    expect(await verifyPushSecret('s3cret!', 's3cret')).toBe(false)
  })
  it('rejects missing or empty values on either side', async () => {
    expect(await verifyPushSecret(null, 's3cret')).toBe(false)
    expect(await verifyPushSecret('', '')).toBe(false)
    expect(await verifyPushSecret('s3cret', undefined)).toBe(false)
  })
})

describe('isRelativePath', () => {
  it('accepts in-app paths', () => {
    expect(isRelativePath('/actividad')).toBe(true)
    expect(isRelativePath('/grupos/1?tab=a#b')).toBe(true)
  })
  it.each(['actividad', '//evil.com', 'https://evil.com', '/\\evil.com', '/a\nb', ''])(
    'rejects %j',
    (value) => {
      expect(isRelativePath(value)).toBe(false)
    },
  )
})

describe('parsePushRequest', () => {
  it('accepts a minimal request', () => {
    expect(parsePushRequest(valid)).toEqual({
      ok: true,
      value: {
        kind: 'maintenance',
        title: 'Mantenimiento',
        body: 'Volvemos en 10 minutos',
        url: null,
        audience: 'all',
        userId: null,
        dryRun: false,
      },
    })
  })
  it('accepts a single-user request with url and dry_run', () => {
    const result = parsePushRequest({
      ...valid,
      audience: 'user',
      user_id: UID,
      url: '/actividad',
      dry_run: true,
    })
    expect(result).toMatchObject({
      ok: true,
      value: { audience: 'user', userId: UID, url: '/actividad', dryRun: true },
    })
  })
  it('enforces the length caps', () => {
    expect(parsePushRequest({ ...valid, title: 'a'.repeat(80) }).ok).toBe(true)
    expect(parsePushRequest({ ...valid, title: 'a'.repeat(81) })).toEqual({
      ok: false,
      reason: 'invalid_title',
    })
    expect(parsePushRequest({ ...valid, body: 'a'.repeat(241) })).toEqual({
      ok: false,
      reason: 'invalid_body_text',
    })
    expect(parsePushRequest({ ...valid, title: '   ' })).toEqual({
      ok: false,
      reason: 'invalid_title',
    })
  })
  it('rejects bad kind, url, audience, user_id and dry_run', () => {
    expect(parsePushRequest({ ...valid, kind: 'spam' })).toEqual({
      ok: false,
      reason: 'invalid_kind',
    })
    expect(parsePushRequest({ ...valid, url: 'https://evil.com' })).toEqual({
      ok: false,
      reason: 'invalid_url',
    })
    expect(parsePushRequest({ ...valid, audience: 'some' })).toEqual({
      ok: false,
      reason: 'invalid_audience',
    })
    expect(parsePushRequest({ ...valid, audience: 'user' })).toEqual({
      ok: false,
      reason: 'invalid_user_id',
    })
    expect(parsePushRequest({ ...valid, audience: 'user', user_id: 'nope' })).toEqual({
      ok: false,
      reason: 'invalid_user_id',
    })
    expect(parsePushRequest({ ...valid, user_id: UID })).toEqual({
      ok: false,
      reason: 'invalid_user_id',
    })
    expect(parsePushRequest({ ...valid, dry_run: 'yes' })).toEqual({
      ok: false,
      reason: 'invalid_dry_run',
    })
  })
  it('rejects non-objects', () => {
    expect(parsePushRequest(null).ok).toBe(false)
    expect(parsePushRequest([]).ok).toBe(false)
    expect(parsePushRequest('x').ok).toBe(false)
  })
})

describe('buildPayload', () => {
  it('carries title, body, url and kind only', () => {
    const parsed = parsePushRequest({ ...valid, url: '/x' })
    if (!parsed.ok) throw new Error('unexpected')
    expect(buildPayload(parsed.value)).toEqual({
      title: 'Mantenimiento',
      body: 'Volvemos en 10 minutos',
      url: '/x',
      kind: 'maintenance',
    })
  })
})

describe('isGone', () => {
  it('detects 404 and 410 only', () => {
    expect(isGone({ statusCode: 404 })).toBe(true)
    expect(isGone({ statusCode: 410 })).toBe(true)
    expect(isGone({ statusCode: 500 })).toBe(false)
    expect(isGone(new Error('x'))).toBe(false)
    expect(isGone(null)).toBe(false)
  })
})

describe('sendToAll', () => {
  const subs = (n: number): PushSubscriptionRow[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `id${i}`,
      endpoint: `https://p/${i}`,
      p256dh: 'k',
      auth: 'a',
    }))

  it('counts sent, failed and removed separately', async () => {
    const outcome = await sendToAll(subs(4), async (s) => {
      if (s.id === 'id1') throw { statusCode: 410 }
      if (s.id === 'id2') throw { statusCode: 404 }
      if (s.id === 'id3') throw { statusCode: 500 }
    })
    expect(outcome.sent).toBe(1)
    expect(outcome.failed).toBe(1)
    expect(outcome.removedIds.sort()).toEqual(['id1', 'id2'])
  })

  it('never exceeds the concurrency bound and visits everyone once', async () => {
    let inFlight = 0
    let peak = 0
    const seen = new Set<string>()
    const outcome = await sendToAll(
      subs(25),
      async (s) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        seen.add(s.id)
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight--
      },
      10,
    )
    expect(peak).toBeLessThanOrEqual(10)
    expect(seen.size).toBe(25)
    expect(outcome.sent).toBe(25)
  })

  it('handles an empty list', async () => {
    expect(await sendToAll([], async () => {})).toEqual({ sent: 0, failed: 0, removedIds: [] })
  })
})
