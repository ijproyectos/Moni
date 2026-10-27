import { toUserMessage } from './errors'

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
    expect(toUserMessage({ code: '54000', message: 'too_many_attempts' })).toMatch(/Demasiados intentos/)
    expect(toUserMessage(new Error('invite_invalid'))).toMatch(/no es válido/)
  })

  it('falls back for unknown errors', () => {
    expect(toUserMessage(new Error('boom'))).toMatch(/Algo salió mal/)
    expect(toUserMessage(undefined)).toMatch(/Algo salió mal/)
  })
})
