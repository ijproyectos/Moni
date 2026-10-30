import { isPlusRequired, mapPlusRequired, PlusRequiredError, toUserMessage } from './errors'

describe('toUserMessage', () => {
  it('translates known database exceptions', () => {
    expect(toUserMessage({ code: '23514', message: 'account_archived' })).toMatch(/archivada/)
  })

  it('translates unique violations', () => {
    expect(toUserMessage({ code: '23505', message: 'duplicate key' })).toMatch(/Ya existe/)
  })

  it('translates shared expense errors', () => {
    expect(toUserMessage({ code: '23514', message: 'balance_not_zero' })).toMatch(/saldo pendiente/)
    expect(toUserMessage({ code: '22023', message: 'percents_must_sum_100' })).toMatch(/sumar 100/)
    expect(toUserMessage({ code: '42501', message: 'not_group_member' })).toMatch(/grupo/)
  })

  it('translates join throttling and the uniform invite error', () => {
    expect(toUserMessage({ code: '54000', message: 'too_many_attempts' })).toMatch(
      /Demasiados intentos/,
    )
    expect(toUserMessage(new Error('invite_invalid'))).toMatch(/no es válido/)
  })

  it('translates budget and period errors', () => {
    expect(toUserMessage({ code: '22023', message: 'invalid_period' })).toMatch(/400 días/)
    expect(
      toUserMessage({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "budgets_owner_category_active_key"',
      }),
    ).toMatch(/ya tiene un límite/)
    expect(toUserMessage({ code: '23514', message: 'category_archived' })).toMatch(/archivada/)
  })

  it('says a screen is not enabled yet when its database function is missing (PGRST202)', () => {
    expect(
      toUserMessage({ code: 'PGRST202', message: 'Could not find the function public.x' }),
    ).toMatch(/falta aplicar su migración/)
  })

  it('falls back for unknown errors', () => {
    expect(toUserMessage(new Error('boom'))).toMatch(/Algo salió mal/)
    expect(toUserMessage(undefined)).toMatch(/Algo salió mal/)
  })
})

describe('plus_required', () => {
  it('detects the marker in RPC errors and in PlusRequiredError', () => {
    expect(isPlusRequired({ code: '54000', message: 'plus_required' })).toBe(true)
    expect(isPlusRequired(new PlusRequiredError())).toBe(true)
    expect(isPlusRequired({ code: '54000', message: 'ai_quota_exceeded' })).toBe(false)
    expect(isPlusRequired(null)).toBe(false)
    expect(isPlusRequired('plus_required')).toBe(false)
  })

  it('maps an RPC error to a typed PlusRequiredError and leaves other errors alone', () => {
    const mapped = mapPlusRequired({ code: '54000', message: 'plus_required' })
    expect(mapped).toBeInstanceOf(PlusRequiredError)
    const other = new Error('boom')
    expect(mapPlusRequired(other)).toBe(other)
  })

  it('has a user message for the upsell and for a wrong promo code', () => {
    expect(toUserMessage(new PlusRequiredError())).toMatch(/Moni Plus/)
    expect(toUserMessage(new Error('promo_invalid'))).toMatch(/código no es válido/)
  })
})
