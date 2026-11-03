import { AdminApiError } from '../api/adminRepository'
import {
  daysLeftLabel,
  describeNotifyError,
  describeSuspendError,
  emailConfirmed,
} from './messages'

describe('describeSuspendError', () => {
  it.each([
    ['cannot_suspend_self', 'No podés suspender tu propia cuenta.'],
    ['cannot_suspend_admin', 'No se puede suspender a otro administrador.'],
    ['confirmation_mismatch', 'El email escrito no coincide con el de la cuenta.'],
  ])('explains %s', (reason, text) => {
    expect(describeSuspendError(new AdminApiError(400, reason))).toBe(text)
  })
  it('falls back to a generic message', () => {
    expect(describeSuspendError(new AdminApiError(500, 'internal_error'))).toBe(
      'No pudimos completar la acción. Probá de nuevo.',
    )
    expect(describeSuspendError(new Error('x'))).toMatch(/Probá de nuevo/)
  })
})

describe('describeNotifyError', () => {
  it('explains the limit, a repeat and a changed situation', () => {
    expect(describeNotifyError(new AdminApiError(429, 'rate_limited', 120))).toMatch(/en 2 min/)
    expect(describeNotifyError(new AdminApiError(409, 'already_notified'))).toBe(
      'Ya se le avisó por este vencimiento.',
    )
    expect(describeNotifyError(new AdminApiError(404, 'not_expiring'))).toMatch(/renovó/)
  })
})

describe('daysLeftLabel', () => {
  it('reads like the push does', () => {
    expect(daysLeftLabel(0)).toBe('hoy')
    expect(daysLeftLabel(1)).toBe('mañana')
    expect(daysLeftLabel(3)).toBe('en 3 días')
  })
})

describe('emailConfirmed', () => {
  it('matches ignoring case and spaces, and never an empty email', () => {
    expect(emailConfirmed(' Persona@X.com ', 'persona@x.com')).toBe(true)
    expect(emailConfirmed('otra@x.com', 'persona@x.com')).toBe(false)
    expect(emailConfirmed('', null)).toBe(false)
  })
})
