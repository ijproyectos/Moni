import { describe, expect, it } from 'vitest'
import {
  buildAutoRecurring,
  matchesOffer,
  PLUS_OFFER,
  SUBSCRIPTION_OFFERS,
} from '../_shared/plusOffer.ts'
import {
  ACTION_THROTTLED,
  buildBackUrl,
  buildPreapprovalBody,
  canTransition,
  classifyMpFailure,
  classifyRpcError,
  isLifecycleAction,
  isMercadoPagoInitPoint,
  LIFECYCLE,
  MP_CANCEL_STATUS,
  parsePreapproval,
  parseRequest,
  pickCurrentSubscription,
  preapprovalUrl,
  publicState,
  selectCancelTargets,
  selectStalePending,
  statusFromMp,
  SYNC_MIN_SECONDS,
  type SubscriptionRow,
  WRITE_MIN_SECONDS,
} from './lib.ts'

describe('offer (server-side constant)', () => {
  it('is Moni Plus, ARS 2999.00 per month', () => {
    expect(SUBSCRIPTION_OFFERS['moni-plus-monthly']).toBe(PLUS_OFFER)
    expect(PLUS_OFFER.reason).toBe('Moni Plus')
    expect(buildAutoRecurring()).toEqual({
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 2999,
      currency_id: 'ARS',
    })
  })

  it('matchesOffer compares amount and currency strictly', () => {
    expect(matchesOffer(2999, 'ARS')).toBe(true)
    expect(matchesOffer(2999.0, 'ars')).toBe(true)
    expect(matchesOffer(2999.01, 'ARS')).toBe(false)
    expect(matchesOffer('2999', 'ARS')).toBe(false)
    expect(matchesOffer(2999, 'USD')).toBe(false)
    expect(matchesOffer(Number.NaN, 'ARS')).toBe(false)
    expect(matchesOffer(2999, undefined)).toBe(false)
  })
})

describe('parseRequest', () => {
  it.each(['create', 'get', 'pause', 'reactivate', 'cancel'])('accepts %s', (action) => {
    expect(parseRequest({ action })).toEqual({ ok: true, action })
  })

  it('ignores any other field: price, email and status cannot ride along', () => {
    expect(
      parseRequest({ action: 'create', amount: 1, payer_email: 'x@y.z', status: 'authorized' }),
    ).toEqual({
      ok: true,
      action: 'create',
    })
  })

  it.each([null, 'create', [], {}, { action: 'delete' }, { action: 5 }, { action: 'CREATE' }])(
    'rejects %j',
    (body) => {
      expect(parseRequest(body)).toEqual({ ok: false })
    },
  )
})

describe('buildBackUrl', () => {
  it('uses the https origin of APP_URL plus /plus/gracias', () => {
    expect(buildBackUrl('https://moni.app')).toBe('https://moni.app/plus/gracias')
    expect(buildBackUrl('https://moni.app/')).toBe('https://moni.app/plus/gracias')
    expect(buildBackUrl(' https://moni.app/algo?x=1 ')).toBe('https://moni.app/plus/gracias')
  })

  it('allows plain http only for localhost', () => {
    expect(buildBackUrl('http://localhost:5173')).toBe('http://localhost:5173/plus/gracias')
    expect(buildBackUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/plus/gracias')
    expect(buildBackUrl('http://moni.app')).toBeNull()
  })

  it.each([
    undefined,
    null,
    '',
    'moni.app',
    'javascript:alert(1)',
    'https://u:p@moni.app',
    'ftp://moni.app',
  ])('rejects %s', (value) => {
    expect(buildBackUrl(value)).toBeNull()
  })
})

describe('buildPreapprovalBody', () => {
  it('matches the without-plan-pending contract and takes only trusted inputs', () => {
    expect(
      buildPreapprovalBody({
        externalReference: 'ref-1',
        payerEmail: 'u@example.com',
        backUrl: 'https://moni.app/plus/gracias',
      }),
    ).toEqual({
      reason: 'Moni Plus',
      external_reference: 'ref-1',
      payer_email: 'u@example.com',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 2999,
        currency_id: 'ARS',
      },
      back_url: 'https://moni.app/plus/gracias',
      status: 'pending',
    })
  })
})

describe('isMercadoPagoInitPoint', () => {
  it.each([
    'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc',
    'https://mercadopago.com/x',
    'https://sandbox.mercadopago.com.ar/x',
  ])('accepts %s', (url) => {
    expect(isMercadoPagoInitPoint(url)).toBe(true)
  })

  it.each([
    'http://www.mercadopago.com.ar/x',
    'https://mercadopago.com.evil.com/x',
    'https://evilmercadopago.com/x',
    'https://www.mercadopago.com.ar@evil.com/x',
    'https://user:pw@www.mercadopago.com.ar/x',
    'https://www.mercadopago.com.ar:8443/x',
    'javascript:alert(1)',
    'not a url',
    '',
    null,
    42,
  ])('rejects %s', (url) => {
    expect(isMercadoPagoInitPoint(url)).toBe(false)
  })
})

describe('status mapping and lifecycle', () => {
  it('maps Mercado Pago statuses, accepting both spellings of cancelled', () => {
    expect(statusFromMp('pending')).toBe('pending')
    expect(statusFromMp('authorized')).toBe('authorized')
    expect(statusFromMp('paused')).toBe('paused')
    expect(statusFromMp('cancelled')).toBe('cancelled')
    expect(statusFromMp('canceled')).toBe('cancelled')
    expect(statusFromMp('finished')).toBeNull()
    expect(statusFromMp(undefined)).toBeNull()
  })

  it('maps actions to statuses through a fixed allowlist', () => {
    expect(LIFECYCLE.pause.mpStatus).toBe('paused')
    expect(LIFECYCLE.reactivate.mpStatus).toBe('authorized')
    expect(LIFECYCLE.cancel.mpStatus).toBe(MP_CANCEL_STATUS)
    expect(isLifecycleAction('pause')).toBe(true)
    expect(isLifecycleAction('create')).toBe(false)
    expect(isLifecycleAction('get')).toBe(false)
  })

  it('only allows sensible transitions', () => {
    expect(canTransition('pause', 'authorized')).toBe(true)
    expect(canTransition('pause', 'paused')).toBe(false)
    expect(canTransition('reactivate', 'paused')).toBe(true)
    expect(canTransition('reactivate', 'cancelled')).toBe(false)
    expect(canTransition('cancel', 'pending')).toBe(true)
    expect(canTransition('cancel', 'cancelled')).toBe(false)
  })
})

describe('pickCurrentSubscription', () => {
  const row = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
    id: 'r',
    preapproval_id: 'p',
    status: 'pending',
    created_at: '2026-11-01T10:00:00Z',
    ...over,
  })

  it('prefers authorized, then paused, then pending, then cancelled', () => {
    const picked = pickCurrentSubscription([
      row({ id: 'c', status: 'cancelled', created_at: '2026-11-05T10:00:00Z' }),
      row({ id: 'a', status: 'authorized', created_at: '2026-10-01T10:00:00Z' }),
      row({ id: 'p', status: 'pending', created_at: '2026-11-06T10:00:00Z' }),
    ])
    expect(picked?.id).toBe('a')
    expect(
      pickCurrentSubscription([
        row({ id: 'c', status: 'cancelled' }),
        row({ id: 'p', status: 'paused' }),
      ])?.id,
    ).toBe('p')
  })

  it('takes the newest within the same status and ignores rows without a preapproval id', () => {
    expect(
      pickCurrentSubscription([
        row({ id: 'old', created_at: '2026-11-01T10:00:00Z' }),
        row({ id: 'new', created_at: '2026-11-02T10:00:00Z' }),
        row({ id: 'orphan', preapproval_id: null, status: 'authorized' }),
      ])?.id,
    ).toBe('new')
    expect(pickCurrentSubscription([row({ preapproval_id: null })])).toBeNull()
    expect(pickCurrentSubscription([])).toBeNull()
  })

  it('exposes only the status to the browser', () => {
    expect(publicState(row({ status: 'authorized' }))).toEqual({ status: 'authorized' })
    expect(publicState(null)).toEqual({ status: 'none' })
  })
})

describe('duplicate-billing helpers', () => {
  const r = (id: string, status: SubscriptionRow['status'], pre: string | null = `p-${id}`) => ({
    id,
    status,
    preapproval_id: pre,
    created_at: '2026-11-01T10:00:00Z',
  })

  it('selects only OTHER pending rows that have a preapproval id as stale', () => {
    const rows = [
      r('new', 'pending'),
      r('a', 'pending'),
      r('b', 'pending', null),
      r('c', 'cancelled'),
      r('d', 'authorized'),
      r('e', 'paused'),
    ]
    expect(selectStalePending(rows, 'new').map((x) => x.id)).toEqual(['a'])
  })

  it('selects every non-cancelled row as a cancel target, including rows without a preapproval id', () => {
    const rows = [
      r('a', 'authorized'),
      r('b', 'pending', null),
      r('c', 'cancelled'),
      r('d', 'paused'),
    ]
    expect(selectCancelTargets(rows).map((x) => x.id)).toEqual(['a', 'b', 'd'])
  })

  it('declares the rate limits and the stable throttle error', () => {
    expect(SYNC_MIN_SECONDS).toBe(15)
    expect(WRITE_MIN_SECONDS).toBe(5)
    expect(ACTION_THROTTLED).toEqual({ http: 429, code: 'action_throttled' })
  })
})

describe('preapproval parsing and URLs', () => {
  it('keeps only id, status and init_point', () => {
    expect(
      parsePreapproval({
        id: 'p1',
        status: 'pending',
        init_point: 'https://x',
        payer_email: 'secret@x.com',
      }),
    ).toEqual({ id: 'p1', status: 'pending', initPoint: 'https://x' })
    expect(parsePreapproval({ status: 'pending' })).toBeNull()
    expect(parsePreapproval(null)).toBeNull()
  })

  it('builds the /preapproval/{id} URL with the id escaped', () => {
    expect(preapprovalUrl('abc')).toBe('https://api.mercadopago.com/preapproval/abc')
    expect(preapprovalUrl('a/b?c')).toBe('https://api.mercadopago.com/preapproval/a%2Fb%3Fc')
  })
})

describe('error classification', () => {
  it('maps database errors to stable codes', () => {
    expect(classifyRpcError({ message: 'already_subscribed' })).toEqual({
      http: 409,
      code: 'already_subscribed',
    })
    expect(classifyRpcError({ message: 'create_throttled' })).toEqual({
      http: 429,
      code: 'too_many_requests',
    })
    expect(classifyRpcError({ message: 'boom' })).toEqual({ http: 500, code: 'server_error' })
    expect(classifyRpcError(null)).toEqual({ http: 500, code: 'server_error' })
  })

  it('maps Mercado Pago failures without leaking their bodies', () => {
    for (const s of [0, 429, 500, 503]) {
      expect(classifyMpFailure(s)).toEqual({ http: 502, code: 'payment_provider_unavailable' })
    }
    for (const s of [400, 401, 403, 422]) {
      expect(classifyMpFailure(s)).toEqual({ http: 502, code: 'payment_provider_error' })
    }
  })
})
