import { GUIDE_STEPS, markGuideDone, markGuidePending, shouldAutoShowGuide } from './guide'

describe('guide state', () => {
  beforeEach(() => window.localStorage.clear())

  it('opens by itself only for a person who just finished the onboarding, and only once', () => {
    expect(shouldAutoShowGuide('u1')).toBe(false)
    markGuidePending('u1')
    expect(shouldAutoShowGuide('u1')).toBe(true)
    markGuideDone('u1')
    expect(shouldAutoShowGuide('u1')).toBe(false)
    markGuidePending('u1')
    expect(shouldAutoShowGuide('u1')).toBe(false)
  })

  it('is per person: someone else on the same device is not affected', () => {
    markGuidePending('u1')
    expect(shouldAutoShowGuide('u2')).toBe(false)
  })

  it('is Inicio (con la carga y el agente) → Grupos → Cuentas → Explorar → Perfil, each on its real screen', () => {
    expect(GUIDE_STEPS.map((s) => [s.id, s.path])).toEqual([
      ['inicio', '/'],
      ['cargar', '/'],
      ['agente', '/'],
      ['grupos', '/grupos'],
      ['cuentas', '/cuentas'],
      ['explorar', '/mas'],
      ['perfil', '/perfil'],
    ])
  })
})
