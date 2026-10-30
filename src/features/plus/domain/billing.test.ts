import {
  ACTIVATION_BACKOFF_MS,
  isActivated,
  isCancellable,
  isMercadoPagoUrl,
  parseSubscriptionState,
  PLUS_PRICE_DISPLAY,
  SUBSCRIBE_LABEL,
  thanksPhase,
} from './billing'

const NOW = new Date('2026-11-06T15:00:00Z')
const FUTURE = '2026-12-06T15:00:00Z'
const LATER = '2027-01-06T15:00:00Z'
const PAST = '2026-10-01T00:00:00Z'

describe('price display', () => {
  it('shows $2.999/mes on the button', () => {
    expect(PLUS_PRICE_DISPLAY.perMonth).toBe('$2.999/mes')
    expect(SUBSCRIBE_LABEL).toBe('Suscribirme · $2.999/mes')
  })
})

describe('parseSubscriptionState', () => {
  it.each(['none', 'pending', 'authorized', 'paused', 'cancelled'])('accepts %s', (status) => {
    expect(parseSubscriptionState({ status })).toBe(status)
  })

  it.each([null, undefined, 'authorized', [], {}, { status: 'canceled' }, { status: 5 }])(
    'rejects %j',
    (value) => {
      expect(parseSubscriptionState(value)).toBeNull()
    },
  )

  it('lets only authorized and paused subscriptions be cancelled from Profile', () => {
    expect(isCancellable('authorized')).toBe(true)
    expect(isCancellable('paused')).toBe(true)
    for (const s of ['none', 'pending', 'cancelled', undefined] as const) {
      expect(isCancellable(s)).toBe(false)
    }
  })
})

describe('isMercadoPagoUrl', () => {
  it('accepts https Mercado Pago hosts', () => {
    expect(isMercadoPagoUrl('https://www.mercadopago.com.ar/subscriptions/checkout?x=1')).toBe(true)
    expect(isMercadoPagoUrl('https://mercadopago.com/x')).toBe(true)
  })

  it.each([
    'http://www.mercadopago.com.ar/x',
    'https://mercadopago.com.evil.com/x',
    'https://evilmercadopago.com',
    'https://www.mercadopago.com.ar@evil.com/',
    'https://www.mercadopago.com.ar:444/x',
    'javascript:alert(1)',
    '',
    undefined,
  ])('rejects %s', (value) => {
    expect(isMercadoPagoUrl(value)).toBe(false)
  })
})

describe('isActivated', () => {
  it('is false while Free', () => {
    expect(isActivated(null, null, NOW)).toBe(false)
    expect(isActivated(null, PAST, NOW)).toBe(false)
  })

  it('is true when a Free person gets Plus', () => {
    expect(isActivated(null, FUTURE, NOW)).toBe(true)
    expect(isActivated(PAST, FUTURE, NOW)).toBe(true)
  })

  it('needs a later expiry when they were already Plus', () => {
    expect(isActivated(FUTURE, FUTURE, NOW)).toBe(false)
    expect(isActivated(FUTURE, LATER, NOW)).toBe(true)
  })

  it('counts any active Plus when the baseline is unknown', () => {
    expect(isActivated(undefined, FUTURE, NOW)).toBe(true)
  })
})

describe('thanksPhase', () => {
  const base = {
    statusLoading: false,
    statusFailed: false,
    activated: false,
    subscription: 'pending' as const,
    attempt: 0,
  }

  it('walks initializing, processing, delayed', () => {
    expect(thanksPhase({ ...base, statusLoading: true })).toBe('initializing')
    expect(thanksPhase(base)).toBe('processing')
    expect(thanksPhase({ ...base, attempt: ACTIVATION_BACKOFF_MS.length })).toBe('delayed')
  })

  it('success wins over everything', () => {
    expect(
      thanksPhase({ ...base, activated: true, statusLoading: true, subscription: 'cancelled' }),
    ).toBe('success')
  })

  it('errors when the status cannot be read or the subscription was cancelled', () => {
    expect(thanksPhase({ ...base, statusFailed: true })).toBe('error')
    expect(thanksPhase({ ...base, subscription: 'cancelled' })).toBe('error')
  })
})
