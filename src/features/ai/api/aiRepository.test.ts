import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { toUserMessage } from '@/shared/lib/errors'
import { AiError, parseMovements } from './aiRepository'

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
