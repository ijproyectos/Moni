import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { onlineManager } from '@tanstack/react-query'
import { OfflineError, OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { toUserMessage } from '@/shared/lib/errors'
import {
  BillingError,
  cancelSubscription,
  createCheckout,
  getSubscriptionState,
  toBillingError,
} from './billingRepository'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }))

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }))

describe('billing repository', () => {
  beforeEach(() => invoke.mockReset())
  afterEach(() => onlineManager.setOnline(true))

  it('sends only the action name', async () => {
    invoke.mockResolvedValue({
      data: { init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=1' },
      error: null,
    })
    await createCheckout()
    expect(invoke).toHaveBeenCalledWith('plus-subscription', { body: { action: 'create' } })
  })

  it('returns a validated Mercado Pago init_point', async () => {
    invoke.mockResolvedValue({
      data: {
        init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=1',
        status: 'pending',
      },
      error: null,
    })
    await expect(createCheckout()).resolves.toBe(
      'https://www.mercadopago.com.ar/subscriptions/checkout?id=1',
    )
  })

  it.each([
    'https://evil.example/pay',
    'http://www.mercadopago.com.ar/x',
    'javascript:alert(1)',
    undefined,
  ])('refuses to redirect to %s', async (initPoint) => {
    invoke.mockResolvedValue({ data: { init_point: initPoint }, error: null })
    await expect(createCheckout()).rejects.toMatchObject({ code: 'payment_provider_error' })
  })

  it('maps the function error code and shows a Spanish message', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: 'already_subscribed' }) })
    const error = await createCheckout().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BillingError)
    expect((error as BillingError).code).toBe('already_subscribed')
    expect(toUserMessage(error)).toBe('Ya tenés una suscripción activa a Moni Plus.')
  })

  it.each([
    ['too_many_requests', /Esperá un minuto/],
    ['payment_provider_unavailable', /Mercado Pago no responde/],
    ['payment_provider_error', /No pudimos iniciar el pago/],
    ['server_misconfigured', /no está disponible/],
  ])('maps %s to a friendly message', (code, message) => {
    expect(toUserMessage(new BillingError(code))).toMatch(message)
  })

  it('falls back to billing_unavailable for non-JSON or network failures', async () => {
    expect(
      (await toBillingError(new FunctionsHttpError(new Response('<html>', { status: 502 })))).code,
    ).toBe('billing_unavailable')
    expect((await toBillingError(new FunctionsFetchError(new Error('x')))).code).toBe(
      'billing_unavailable',
    )
  })

  it('refuses offline before any request', async () => {
    onlineManager.setOnline(false)
    const error = await createCheckout().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OfflineError)
    expect(toUserMessage(error)).toBe(OFFLINE_MESSAGE)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reads the subscription state and rejects unexpected payloads', async () => {
    invoke.mockResolvedValueOnce({ data: { status: 'authorized' }, error: null })
    await expect(getSubscriptionState()).resolves.toBe('authorized')
    invoke.mockResolvedValueOnce({ data: { status: 'weird' }, error: null })
    await expect(getSubscriptionState()).rejects.toMatchObject({ code: 'billing_unavailable' })
  })

  it('cancel sends the cancel action and returns the new state', async () => {
    invoke.mockResolvedValue({ data: { status: 'cancelled' }, error: null })
    await expect(cancelSubscription()).resolves.toBe('cancelled')
    expect(invoke).toHaveBeenCalledWith('plus-subscription', { body: { action: 'cancel' } })
  })
})
