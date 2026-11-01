import { describe, expect, it } from 'vitest'
import {
  auditSection,
  decideAccess,
  decidePushRateLimit,
  hasVerifiedGoogleIdentity,
  isAllowedEmail,
  parseAdminRequest,
  parseAllowlist,
} from './lib.ts'

const ID = '11111111-1111-4111-8111-111111111111'

describe('parseAllowlist', () => {
  it('trims, lowercases and drops empties and duplicates', () => {
    expect(parseAllowlist(' Jonatan@Mail.com , b@y.com,,  ,B@Y.COM')).toEqual([
      'jonatan@mail.com',
      'b@y.com',
    ])
  })
  it('returns an empty list when missing or blank', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
    expect(parseAllowlist(' , ,')).toEqual([])
  })
})

describe('isAllowedEmail', () => {
  const list = ['a@x.com']
  it('matches ignoring case and spaces', () =>
    expect(isAllowedEmail('  A@X.com ', list)).toBe(true))
  it('rejects others, empty values and an empty list', () => {
    expect(isAllowedEmail('b@x.com', list)).toBe(false)
    expect(isAllowedEmail('', list)).toBe(false)
    expect(isAllowedEmail(null, list)).toBe(false)
    expect(isAllowedEmail('a@x.com', [])).toBe(false)
  })
})

describe('decideAccess', () => {
  const list = ['admin@x.com']
  it('refuses an unconfirmed email even when it is in the list', () => {
    expect(decideAccess({ email: 'admin@x.com', email_confirmed_at: null }, list)).toEqual({
      ok: false,
      reason: 'email_not_confirmed',
    })
  })
  it('refuses a confirmed email that is not in the list', () => {
    expect(decideAccess({ email: 'other@x.com', email_confirmed_at: '2026-01-01' }, list)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })
  it('allows a confirmed email in the list (case-insensitive)', () => {
    expect(decideAccess({ email: 'Admin@X.com', email_confirmed_at: '2026-01-01' }, list)).toEqual({
      ok: true,
      email: 'admin@x.com',
    })
  })
  it('allows a verified Google identity when the email is not confirmed', () => {
    const user = {
      email: 'admin@x.com',
      email_confirmed_at: null,
      identities: [
        { provider: 'google', identity_data: { email: 'admin@x.com', email_verified: true } },
      ],
    }
    expect(decideAccess(user, list)).toEqual({ ok: true, email: 'admin@x.com' })
  })
  it('does not trust an unverified or mismatching Google identity', () => {
    const unverified = {
      email: 'admin@x.com',
      identities: [
        { provider: 'google', identity_data: { email: 'admin@x.com', email_verified: false } },
      ],
    }
    const mismatch = {
      email: 'admin@x.com',
      identities: [
        { provider: 'google', identity_data: { email: 'else@x.com', email_verified: true } },
      ],
    }
    expect(hasVerifiedGoogleIdentity(unverified)).toBe(false)
    expect(hasVerifiedGoogleIdentity(mismatch)).toBe(false)
    expect(decideAccess(unverified, list).ok).toBe(false)
  })
  it('nobody is admin when the list is empty (ADMIN_EMAILS unset)', () => {
    expect(
      decideAccess(
        { email: 'admin@x.com', email_confirmed_at: '2026-01-01' },
        parseAllowlist(undefined),
      ),
    ).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })
  it('refuses a user without email', () => {
    expect(decideAccess({ email: null, email_confirmed_at: '2026-01-01' }, list)).toEqual({
      ok: false,
      reason: 'no_email',
    })
  })
})

describe('parseAdminRequest', () => {
  it('accepts plain sections', () => {
    expect(parseAdminRequest({ section: 'resumen' })).toEqual({
      ok: true,
      value: { kind: 'section', section: 'resumen' },
    })
  })
  it('rejects unknown sections and non-objects', () => {
    expect(parseAdminRequest({ section: 'drop' }).ok).toBe(false)
    expect(parseAdminRequest(null).ok).toBe(false)
    expect(parseAdminRequest([]).ok).toBe(false)
  })
  it('clamps pagination and applies defaults', () => {
    expect(parseAdminRequest({ section: 'usuarios', limit: 5000, offset: -4 })).toEqual({
      ok: true,
      value: {
        kind: 'section',
        section: 'usuarios',
        search: '',
        filter: 'todos',
        limit: 100,
        offset: 0,
      },
    })
  })
  it('rejects a bad filter, a long search and non-integer paging', () => {
    expect(parseAdminRequest({ section: 'usuarios', filter: 'x' }).ok).toBe(false)
    expect(parseAdminRequest({ section: 'usuarios', search: 'a'.repeat(101) }).ok).toBe(false)
    expect(parseAdminRequest({ section: 'usuarios', limit: 1.5 }).ok).toBe(false)
  })
  it('requires a uuid for the detail', () => {
    expect(parseAdminRequest({ section: 'usuario', user_id: 'nope' }).ok).toBe(false)
    expect(parseAdminRequest({ section: 'usuario', user_id: ID }).ok).toBe(true)
  })
  it('validates a push through the push-send rules', () => {
    const ok = parseAdminRequest({
      action: 'push_user',
      user_id: ID,
      title: 'Hola',
      body: 'Qué tal',
    })
    expect(ok.ok).toBe(true)
    if (ok.ok && ok.value.kind === 'push') {
      expect(ok.value.push.audience).toBe('user')
      expect(ok.value.push.userId).toBe(ID)
    }
    expect(parseAdminRequest({ action: 'push_user', user_id: ID, title: '', body: 'x' }).ok).toBe(
      false,
    )
    expect(
      parseAdminRequest({ action: 'push_user', user_id: ID, title: 'x', body: 'y'.repeat(241) }).ok,
    ).toBe(false)
    expect(parseAdminRequest({ action: 'push_user', user_id: 'x', title: 'x', body: 'y' }).ok).toBe(
      false,
    )
  })
  it('never reads identity from the body', () => {
    const parsed = parseAdminRequest({ section: 'resumen', email: 'admin@x.com', admin: true })
    expect(parsed).toEqual({ ok: true, value: { kind: 'section', section: 'resumen' } })
  })
})

describe('decidePushRateLimit', () => {
  const now = new Date('2026-11-01T12:00:00Z')
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

  it('allows while under the limit', () => {
    expect(decidePushRateLimit([minutesAgo(5), minutesAgo(10)], now)).toEqual({
      allowed: true,
      remaining: 8,
      retryAfterSeconds: 0,
    })
  })
  it('blocks at 10 in the last hour and says when to retry', () => {
    const stamps = Array.from({ length: 10 }, (_, i) => minutesAgo(50 - i))
    const decision = decidePushRateLimit(stamps, now)
    expect(decision.allowed).toBe(false)
    expect(decision.retryAfterSeconds).toBe(10 * 60)
  })
  it('ignores actions older than the window', () => {
    const stamps = Array.from({ length: 10 }, () => minutesAgo(61))
    expect(decidePushRateLimit(stamps, now).allowed).toBe(true)
  })
  it('ignores unparseable timestamps', () => {
    expect(decidePushRateLimit(['garbage'], now).remaining).toBe(10)
  })
})

describe('auditSection', () => {
  it('names the section or the action, never a body', () => {
    expect(auditSection({ kind: 'section', section: 'plus' })).toBe('plus')
    const parsed = parseAdminRequest({ action: 'push_user', user_id: ID, title: 't', body: 'b' })
    if (parsed.ok) expect(auditSection(parsed.value)).toBe('push_user')
  })
})
