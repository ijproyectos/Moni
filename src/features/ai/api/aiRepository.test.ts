import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { onlineManager } from '@tanstack/react-query'
import { PlusRequiredError, toUserMessage } from '@/shared/lib/errors'
import { OfflineError } from '@/shared/lib/offline'
import { AiError, parseMovements, parseReceipt } from './aiRepository'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }))

const GOOD = {
  movements: [
    {
      kind: 'expense',
      amountCents: 500_000,
      note: 'Colectivo',
      categoryId: null,
      accountId: null,
      occurredOn: '2026-10-28',
      confidence: 0.9,
    },
  ],
  warnings: [],
}

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }))
}

describe('parseMovements', () => {
  beforeEach(() => invoke.mockReset())

  it('sends only text and today, and returns the validated draft', async () => {
    invoke.mockResolvedValue({ data: GOOD, error: null })
    const result = await parseMovements('5 lucas bondi', '2026-10-28')
    expect(invoke).toHaveBeenCalledWith('parse-movements', {
      body: { text: '5 lucas bondi', today: '2026-10-28' },
    })
    expect(result.movements[0]?.amountCents).toBe(500_000)
  })

  it('maps the quota error code to the friendly message', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, { error: 'ai_quota_exceeded' }) })
    const error = await parseMovements('x', '2026-10-28').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect(toUserMessage(error)).toBe(
      'Llegaste al límite de cargas con Moni por hoy. Probá mañana o cargalo a mano.',
    )
  })

  it('maps HTTP 402 plus_required to a typed PlusRequiredError', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(402, { error: 'plus_required' }) })
    await expect(parseMovements('x', '2026-10-28')).rejects.toBeInstanceOf(PlusRequiredError)
    invoke.mockResolvedValue({ data: null, error: httpError(402, null) })
    await expect(parseMovements('x', '2026-10-28')).rejects.toBeInstanceOf(PlusRequiredError)
  })

  it('maps network failures, unknown bodies and malformed data to ai_unavailable', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('offline')) })
    await expect(parseMovements('x', '2026-10-28')).rejects.toMatchObject({
      code: 'ai_unavailable',
    })

    invoke.mockResolvedValue({ data: null, error: httpError(500, 'boom') })
    await expect(parseMovements('x', '2026-10-28')).rejects.toMatchObject({
      code: 'ai_unavailable',
    })

    invoke.mockResolvedValue({ data: { movements: [{ kind: 'transfer' }] }, error: null })
    await expect(parseMovements('x', '2026-10-28')).rejects.toMatchObject({
      code: 'ai_unavailable',
    })
    expect(toUserMessage(new AiError('ai_unavailable'))).toMatch(/Probá de nuevo/)
  })
})

describe('parseReceipt', () => {
  const IMAGE = { base64: 'QUJD', mediaType: 'image/jpeg' }
  beforeEach(() => invoke.mockReset())
  afterEach(() => onlineManager.setOnline(true))

  it('sends the image, media type and today, and returns the validated single-expense draft', async () => {
    invoke.mockResolvedValue({ data: GOOD, error: null })
    const controller = new AbortController()
    const result = await parseReceipt(IMAGE, '2026-10-28', controller.signal)
    expect(invoke).toHaveBeenCalledWith('parse-receipt', {
      body: { image: 'QUJD', mediaType: 'image/jpeg', today: '2026-10-28' },
      signal: controller.signal,
    })
    expect(result.movements[0]?.amountCents).toBe(500_000)
  })

  it('fails with OfflineError before any request when there is no connection', async () => {
    onlineManager.setOnline(false)
    await expect(parseReceipt(IMAGE, '2026-10-28')).rejects.toBeInstanceOf(OfflineError)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('maps the daily quota (429) to the friendly message', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, { error: 'ai_quota_exceeded' }) })
    const error = await parseReceipt(IMAGE, '2026-10-28').catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'ai_quota_exceeded' })
    expect(toUserMessage(error)).toMatch(/límite/)
  })

  it('maps HTTP 402 plus_required from parse-receipt to PlusRequiredError', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(402, { error: 'plus_required' }) })
    await expect(parseReceipt(IMAGE, '2026-10-28')).rejects.toBeInstanceOf(PlusRequiredError)
  })

  it('maps unsupported currency and unreadable receipts to specific messages', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(422, { error: 'unsupported_currency' }),
    })
    const currency = await parseReceipt(IMAGE, '2026-10-28').catch((e: unknown) => e)
    expect(currency).toMatchObject({ code: 'unsupported_currency' })
    expect(toUserMessage(currency)).toMatch(/pesos argentinos/)

    invoke.mockResolvedValue({ data: null, error: httpError(422, { error: 'receipt_unreadable' }) })
    const unreadable = await parseReceipt(IMAGE, '2026-10-28').catch((e: unknown) => e)
    expect(toUserMessage(unreadable)).toMatch(/No pudimos leer el total/)

    invoke.mockResolvedValue({ data: null, error: httpError(413, { error: 'image_too_large' }) })
    const large = await parseReceipt(IMAGE, '2026-10-28').catch((e: unknown) => e)
    expect(toUserMessage(large)).toMatch(/demasiado pesada/)
  })

  it('maps network failures, empty or malformed data to ai_unavailable', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('net')) })
    await expect(parseReceipt(IMAGE, '2026-10-28')).rejects.toMatchObject({
      code: 'ai_unavailable',
    })
    invoke.mockResolvedValue({ data: { movements: [], warnings: [] }, error: null })
    await expect(parseReceipt(IMAGE, '2026-10-28')).rejects.toMatchObject({
      code: 'ai_unavailable',
    })
    invoke.mockResolvedValue({ data: { nope: true }, error: null })
    await expect(parseReceipt(IMAGE, '2026-10-28')).rejects.toMatchObject({
      code: 'ai_unavailable',
    })
  })

  it('reports a cancelled request as such', async () => {
    const controller = new AbortController()
    controller.abort()
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('aborted')) })
    await expect(parseReceipt(IMAGE, '2026-10-28', controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    })
  })
})
