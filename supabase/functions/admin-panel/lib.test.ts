import { describe, expect, it } from 'vitest'
import {
  auditSection,
  decideAccess,
  decidePushRateLimit,
  decideSuspension,
  supportReplyPush,
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

describe('parseAdminRequest: support and plus sections', () => {
  it('reads the support inbox with defaults and a validated filter', () => {
    expect(parseAdminRequest({ section: 'soporte' })).toEqual({
      ok: true,
      value: { kind: 'section', section: 'soporte', status: 'open', limit: 25, offset: 0 },
    })
    const resolved = parseAdminRequest({ section: 'soporte', status: 'resolved', limit: 500 })
    expect(resolved).toMatchObject({ ok: true, value: { status: 'resolved', limit: 100 } })
    expect(parseAdminRequest({ section: 'soporte', status: 'closed' })).toEqual({
      ok: false,
      reason: 'invalid_status',
    })
  })
  it('reads one ticket only with a uuid', () => {
    expect(parseAdminRequest({ section: 'soporte_ticket', ticket_id: ID })).toEqual({
      ok: true,
      value: { kind: 'section', section: 'soporte_ticket', ticketId: ID },
    })
    expect(parseAdminRequest({ section: 'soporte_ticket', ticket_id: 'nope' }).ok).toBe(false)
  })
  it('reads the expiring Plus list, 7 days by default and 30 at most', () => {
    expect(parseAdminRequest({ section: 'plus_vencen' })).toMatchObject({
      ok: true,
      value: { section: 'plus_vencen', days: 7 },
    })
    expect(parseAdminRequest({ section: 'plus_vencen', days: 999 })).toMatchObject({
      value: { days: 30 },
    })
    expect(parseAdminRequest({ section: 'plus_vencen', days: 'x' }).ok).toBe(false)
  })
  it('reads the automatic notices state', () => {
    expect(parseAdminRequest({ section: 'avisos' })).toEqual({
      ok: true,
      value: { kind: 'section', section: 'avisos' },
    })
  })
})

describe('parseAdminRequest: actions', () => {
  it('suspends with a trimmed reason and a lowercase confirmation', () => {
    expect(
      parseAdminRequest({
        action: 'suspend_user',
        user_id: ID,
        reason: '  Uso abusivo  ',
        confirm_email: ' Persona@Example.com ',
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: 'suspend',
        userId: ID,
        reason: 'Uso abusivo',
        confirmEmail: 'persona@example.com',
      },
    })
  })
  it.each([
    [{ user_id: 'x', reason: 'Uso abusivo', confirm_email: 'a@b.c' }, 'invalid_user_id'],
    [{ user_id: ID, reason: 'ab', confirm_email: 'a@b.c' }, 'invalid_reason'],
    [{ user_id: ID, reason: 'x'.repeat(201), confirm_email: 'a@b.c' }, 'invalid_reason'],
    [{ user_id: ID, reason: 'Uso abusivo', confirm_email: '  ' }, 'invalid_confirmation'],
  ])('refuses a bad suspension %j', (body, reason) => {
    expect(parseAdminRequest({ action: 'suspend_user', ...body })).toEqual({ ok: false, reason })
  })
  it('lifts a suspension and notifies an expiring Plus by user id only', () => {
    expect(parseAdminRequest({ action: 'unsuspend_user', user_id: ID })).toEqual({
      ok: true,
      value: { kind: 'unsuspend', userId: ID },
    })
    expect(parseAdminRequest({ action: 'plus_notify', user_id: ID })).toEqual({
      ok: true,
      value: { kind: 'plus_notify', userId: ID },
    })
    expect(parseAdminRequest({ action: 'plus_notify' }).ok).toBe(false)
  })
  it('replies to a ticket within 2000 characters, optionally resolving it', () => {
    expect(
      parseAdminRequest({
        action: 'support_reply',
        ticket_id: ID,
        reply: ' Listo ',
        resolve: true,
      }),
    ).toEqual({
      ok: true,
      value: { kind: 'support_reply', ticketId: ID, reply: 'Listo', resolve: true },
    })
    expect(
      parseAdminRequest({ action: 'support_reply', ticket_id: ID, reply: 'ok' }),
    ).toMatchObject({
      value: { resolve: false },
    })
    expect(parseAdminRequest({ action: 'support_reply', ticket_id: ID, reply: ' ' }).ok).toBe(false)
    expect(
      parseAdminRequest({ action: 'support_reply', ticket_id: ID, reply: 'x'.repeat(2001) }).ok,
    ).toBe(false)
    expect(
      parseAdminRequest({ action: 'support_reply', ticket_id: ID, reply: 'ok', resolve: 'yes' }).ok,
    ).toBe(false)
  })
  it('changes a ticket status only to open or resolved', () => {
    expect(
      parseAdminRequest({ action: 'support_status', ticket_id: ID, status: 'resolved' }),
    ).toEqual({ ok: true, value: { kind: 'support_status', ticketId: ID, status: 'resolved' } })
    expect(parseAdminRequest({ action: 'support_status', ticket_id: ID, status: 'x' }).ok).toBe(
      false,
    )
  })
  it('flips only the known switches with a boolean', () => {
    expect(
      parseAdminRequest({ action: 'setting_set', key: 'nightly_push_enabled', enabled: false }),
    ).toEqual({ ok: true, value: { kind: 'setting', key: 'nightly_push_enabled', enabled: false } })
    expect(parseAdminRequest({ action: 'setting_set', key: 'other', enabled: true }).ok).toBe(false)
    expect(
      parseAdminRequest({ action: 'setting_set', key: 'nightly_push_enabled', enabled: 'no' }).ok,
    ).toBe(false)
  })
  it('refuses an unknown action', () => {
    expect(parseAdminRequest({ action: 'delete_everything' })).toEqual({
      ok: false,
      reason: 'invalid_action',
    })
  })
})

describe('decideSuspension', () => {
  const base = {
    adminEmail: 'admin@x.com',
    targetEmail: 'persona@x.com',
    confirmEmail: 'persona@x.com',
    allowlist: ['admin@x.com', 'otro-admin@x.com'],
  }
  it('allows a regular user whose email was typed back', () => {
    expect(decideSuspension(base)).toEqual({ ok: true })
    expect(decideSuspension({ ...base, confirmEmail: ' PERSONA@x.com ' })).toEqual({ ok: true })
  })
  it('never suspends the admin who asks', () => {
    expect(
      decideSuspension({ ...base, targetEmail: 'ADMIN@x.com', confirmEmail: 'admin@x.com' }),
    ).toEqual({ ok: false, reason: 'cannot_suspend_self' })
  })
  it('never suspends another admin', () => {
    expect(
      decideSuspension({
        ...base,
        targetEmail: 'otro-admin@x.com',
        confirmEmail: 'otro-admin@x.com',
      }),
    ).toEqual({ ok: false, reason: 'cannot_suspend_admin' })
  })
  it('requires the typed confirmation to match', () => {
    expect(decideSuspension({ ...base, confirmEmail: 'otra@x.com' })).toEqual({
      ok: false,
      reason: 'confirmation_mismatch',
    })
  })
  it('refuses an account without email', () => {
    expect(decideSuspension({ ...base, targetEmail: null })).toEqual({
      ok: false,
      reason: 'no_target_email',
    })
  })
})

describe('supportReplyPush', () => {
  it('tells the person there is an answer without putting it in the notification', () => {
    const push = supportReplyPush(ID)
    expect(push).toMatchObject({
      kind: 'support',
      audience: 'user',
      userId: ID,
      url: '/soporte',
      dryRun: false,
    })
    expect(push.title.length).toBeLessThanOrEqual(80)
    expect(push.body.length).toBeLessThanOrEqual(240)
  })
})

describe('auditSection for the new requests', () => {
  it('records every kind with a name the audit table accepts', () => {
    const names = [
      auditSection({ kind: 'suspend', userId: ID, reason: 'abc', confirmEmail: 'a@b.c' }),
      auditSection({ kind: 'unsuspend', userId: ID }),
      auditSection({ kind: 'plus_notify', userId: ID }),
      auditSection({ kind: 'support_reply', ticketId: ID, reply: 'x', resolve: false }),
      auditSection({ kind: 'support_status', ticketId: ID, status: 'open' }),
      auditSection({ kind: 'setting', key: 'nightly_push_enabled', enabled: true }),
      auditSection({ kind: 'section', section: 'soporte_ticket', ticketId: ID }),
    ]
    for (const name of names) expect(name).toMatch(/^[a-z_]{1,40}$/)
  })
})
