import { describe, expect, it } from 'vitest'
import {
  buildPayload,
  filterSuspended,
  isGone,
  isRelativePath,
  parsePushJob,
  parsePushRequest,
  plusExpiryMessage,
  runPlusExpiryJob,
  sendToAll,
  verifyAnyPushSecret,
  verifyPushSecret,
  type PlusExpiryDeps,
  type PlusExpiryDue,
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

describe('verifyAnyPushSecret', () => {
  it('accepts the admin secret or the cron secret, and nothing else', async () => {
    expect(await verifyAnyPushSecret('admin-1', ['admin-1', 'cron-1'])).toBe(true)
    expect(await verifyAnyPushSecret('cron-1', ['admin-1', 'cron-1'])).toBe(true)
    expect(await verifyAnyPushSecret('other', ['admin-1', 'cron-1'])).toBe(false)
  })
  it('ignores a secret that is not configured and never matches an empty header', async () => {
    expect(await verifyAnyPushSecret('cron-1', [undefined, 'cron-1'])).toBe(true)
    expect(await verifyAnyPushSecret(null, ['admin-1', 'cron-1'])).toBe(false)
    expect(await verifyAnyPushSecret('', [undefined, undefined])).toBe(false)
  })
})

describe('the nightly reminder request', () => {
  it('is accepted exactly as the cron sends it', () => {
    const parsed = parsePushRequest({
      kind: 'reminder',
      title: 'Moni',
      body: 'Cargaste tus gastos de hoy',
      audience: 'all',
      url: '/',
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        kind: 'reminder',
        title: 'Moni',
        body: 'Cargaste tus gastos de hoy',
        url: '/',
        audience: 'all',
        userId: null,
        dryRun: false,
      },
    })
  })
  it.each(['plus_expiry', 'support'])('accepts the %s kind', (kind) => {
    expect(parsePushRequest({ ...valid, kind }).ok).toBe(true)
  })
})

describe('filterSuspended', () => {
  const rows = [{ id: 'a', user_id: 'u1' }, { id: 'b', user_id: 'u2' }, { id: 'c' }]
  it('drops the subscriptions of suspended users and keeps the rest', () => {
    expect(filterSuspended(rows, new Set(['u2'])).map((r) => r.id)).toEqual(['a', 'c'])
  })
  it('keeps everything when nobody is suspended', () => {
    expect(filterSuspended(rows, new Set())).toHaveLength(3)
  })
})

describe('parsePushJob', () => {
  it('accepts only the plus_expiry job with no extra fields', () => {
    expect(parsePushJob({ job: 'plus_expiry' })).toEqual({ ok: true, job: 'plus_expiry' })
    expect(parsePushJob({ job: 'plus_expiry', audience: 'all' }).ok).toBe(false)
    expect(parsePushJob({ job: 'other' }).ok).toBe(false)
    expect(parsePushJob([]).ok).toBe(false)
    expect(parsePushJob(null).ok).toBe(false)
  })
})

describe('plusExpiryMessage', () => {
  it('says when Plus ends, in plain words', () => {
    expect(plusExpiryMessage(3).title).toBe('Tu Moni Plus vence en 3 días')
    expect(plusExpiryMessage(1).title).toBe('Tu Moni Plus vence mañana')
    expect(plusExpiryMessage(0).title).toBe('Tu Moni Plus vence hoy')
  })
  it('opens the profile and fits the push limits', () => {
    const message = plusExpiryMessage(3)
    expect(message.url).toBe('/perfil')
    expect(message.kind).toBe('plus_expiry')
    expect(message.title.length).toBeLessThanOrEqual(80)
    expect(message.body.length).toBeLessThanOrEqual(240)
  })
})

describe('runPlusExpiryJob', () => {
  const sub = (id: string): PushSubscriptionRow => ({
    id,
    endpoint: `https://push.example/${id}`,
    p256dh: 'p',
    auth: 'a',
  })
  const due = (userId: string, daysLeft = 3): PlusExpiryDue => ({
    userId,
    expiresAt: '2026-11-05T15:00:00Z',
    daysLeft,
  })

  function setup(over: Partial<PlusExpiryDeps> & { due?: PlusExpiryDue[] } = {}) {
    const sent: string[] = []
    const recorded: string[] = []
    const messages: Array<{ userId: string; sent: number; title: string }> = []
    const pruned: string[][] = []
    const deps: PlusExpiryDeps = {
      listDue: async () => over.due ?? [due('u1')],
      loadSubscriptions: async (userId) => [sub(`${userId}-1`)],
      send: async (s, payload) => {
        sent.push(`${s.id}:${JSON.parse(payload).title}`)
      },
      recordNotice: async (d) => {
        recorded.push(`${d.userId}:${d.daysLeft}`)
        return true
      },
      pruneSubscriptions: async (ids) => {
        pruned.push(ids)
      },
      recordMessage: async (entry) => {
        messages.push({ userId: entry.userId, sent: entry.sent, title: entry.title })
      },
      ...over,
    }
    return { deps, sent, recorded, messages, pruned }
  }

  it('notifies each due person once with the message for their days left', async () => {
    const { deps, sent, recorded, messages } = setup({ due: [due('u1', 3), due('u2', 1)] })
    const result = await runPlusExpiryJob(deps)
    expect(result).toMatchObject({ due: 2, notified: 2, failed: 0, without_devices: 0 })
    expect(sent).toEqual(['u1-1:Tu Moni Plus vence en 3 días', 'u2-1:Tu Moni Plus vence mañana'])
    expect(recorded).toEqual(['u1:3', 'u2:1'])
    expect(messages.map((m) => m.userId)).toEqual(['u1', 'u2'])
  })

  it('reserves the notice before sending', async () => {
    const order: string[] = []
    const { deps } = setup({
      recordNotice: async () => {
        order.push('record')
        return true
      },
      send: async () => {
        order.push('send')
      },
    })
    await runPlusExpiryJob(deps)
    expect(order).toEqual(['record', 'send'])
  })

  it('skips a notice that was already recorded and sends nothing', async () => {
    const { deps, sent } = setup({ recordNotice: async () => false })
    const result = await runPlusExpiryJob(deps)
    expect(result).toMatchObject({ already_notified: 1, notified: 0 })
    expect(sent).toEqual([])
  })

  it('skips a person with no device without reserving the notice', async () => {
    const { deps, recorded } = setup({ loadSubscriptions: async () => [] })
    const result = await runPlusExpiryJob(deps)
    expect(result).toMatchObject({ without_devices: 1, notified: 0 })
    expect(recorded).toEqual([])
  })

  it('counts a person whose every device failed as failed, not notified', async () => {
    const { deps } = setup({
      send: async () => {
        throw new Error('boom')
      },
    })
    expect(await runPlusExpiryJob(deps)).toMatchObject({ notified: 0, failed: 1 })
  })

  it('prunes devices the push service reports as gone', async () => {
    const { deps, pruned } = setup({
      send: async () => {
        throw Object.assign(new Error('gone'), { statusCode: 410 })
      },
    })
    await runPlusExpiryJob(deps)
    expect(pruned).toEqual([['u1-1']])
  })

  it('does nothing when nobody is due', async () => {
    const { deps, sent } = setup({ due: [] })
    expect(await runPlusExpiryJob(deps)).toMatchObject({ due: 0, notified: 0 })
    expect(sent).toEqual([])
  })
})
