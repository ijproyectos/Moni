import {
  describeTicketError,
  MESSAGE_MAX,
  SUBJECT_MAX,
  ticketStatusLabel,
  validateTicket,
} from './support'

describe('validateTicket', () => {
  it('accepts a normal ticket', () => {
    expect(validateTicket({ subject: 'No me carga un gasto', message: 'Pasa en Actividad.' })).toBeNull()
  })
  it('trims before counting', () => {
    expect(validateTicket({ subject: '  ab  ', message: 'texto' })).toBe('subject_short')
    expect(validateTicket({ subject: 'Asunto', message: '   ' })).toBe('message_empty')
  })
  it('keeps the database limits', () => {
    expect(validateTicket({ subject: 'x'.repeat(SUBJECT_MAX), message: 'ok' })).toBeNull()
    expect(validateTicket({ subject: 'x'.repeat(SUBJECT_MAX + 1), message: 'ok' })).toBe('subject_long')
    expect(validateTicket({ subject: 'Asunto', message: 'x'.repeat(MESSAGE_MAX) })).toBeNull()
    expect(validateTicket({ subject: 'Asunto', message: 'x'.repeat(MESSAGE_MAX + 1) })).toBe('message_long')
  })
})

describe('ticketStatusLabel', () => {
  it('tells open, answered and resolved apart', () => {
    expect(ticketStatusLabel({ status: 'open', reply: null })).toBe('Abierta')
    expect(ticketStatusLabel({ status: 'open', reply: 'Hola' })).toBe('Respondida')
    expect(ticketStatusLabel({ status: 'resolved', reply: 'Hola' })).toBe('Resuelta')
  })
})

describe('describeTicketError', () => {
  it('explains the daily limit', () => {
    expect(describeTicketError(new Error('too_many_tickets'))).toMatch(/5 consultas/)
    expect(describeTicketError({ message: 'too_many_tickets' })).toMatch(/5 consultas/)
  })
  it('falls back to a generic message', () => {
    expect(describeTicketError(new Error('boom'))).toBe('No pudimos enviar tu consulta. Probá de nuevo.')
    expect(describeTicketError(null)).toBe('No pudimos enviar tu consulta. Probá de nuevo.')
  })
})
