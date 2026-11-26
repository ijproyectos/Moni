import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { markGuidePending, shouldAutoShowGuide } from '../domain/guide'
import { GuideHost } from './GuideHost'
import { requestGuide } from './guideStore'

const status = vi.hoisted(() => ({ value: null as string | null, save: vi.fn() }))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../api/useGuideStatus', () => ({
  useGuideStatus: () => ({ status: status.value, loaded: true, save: status.save }),
}))

/** The real elements the tour points at on every screen (only the ones given exist). */
function mountTargets(skip: string[] = []) {
  const html: Record<string, string> = {
    inicio: '<section aria-labelledby="hero-title">Hero</section><section aria-label="Cargar un movimiento">Cargar</section><button aria-label="Hablá con Moni"></button>',
    grupos: '<button aria-label="Ver lo que te deben">Te deben</button>',
    h1: '<main><h1>Pantalla</h1></main>',
    cuentas: '<button aria-label="Abrir Efectivo">Efectivo</button>',
    explorar: '<a href="/metas">Metas</a>',
    perfil: '<div data-guide="profile-group">Datos</div>',
  }
  document.body.insertAdjacentHTML('beforeend', Object.entries(html).filter(([k]) => !skip.includes(k)).map(([, v]) => v).join(''))
}

function Path() {
  return <p data-testid="path">{useLocation().pathname}</p>
}
function setup(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GuideHost />
      <Path />
    </MemoryRouter>,
  )
}
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(400)))

describe('GuideHost', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.body.innerHTML = ''
    status.value = null
    status.save.mockReset()
    status.save.mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => vi.useRealTimers())

  it('does not show for people who did not just finish the onboarding', async () => {
    mountTargets()
    setup()
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not show by itself when the account already saved that it was seen', async () => {
    mountTargets()
    markGuidePending('u1')
    status.value = 'completed'
    setup()
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens each real screen in turn, goes back and forth keeping the progress, and saves "completed" at the end', async () => {
    mountTargets()
    markGuidePending('u1')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    await settle()
    expect(screen.getByRole('dialog', { name: 'Guía de Moni: Inicio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Omitir guía' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Atrás' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await settle()
    const cargar = screen.getByRole('dialog', { name: 'Guía de Moni: Cargá tus movimientos' })
    expect(cargar).toHaveTextContent(/foto de tu ticket.*voz.*manualmente/)
    await user.click(screen.getByRole('button', { name: 'Atrás' }))
    await settle()
    expect(screen.getByRole('dialog', { name: 'Guía de Moni: Inicio' })).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await settle()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await settle()
    expect(screen.getByRole('dialog', { name: 'Guía de Moni: Tu asistente financiero' })).toHaveTextContent(/Moni está para ayudarte/)
    expect(screen.getByRole('dialog', { name: 'Guía de Moni: Tu asistente financiero' })).not.toHaveTextContent(/gatito/i)
    const route = ['/grupos', '/cuentas', '/mas', '/perfil']
    for (const [i, title] of ['Grupos', 'Cuentas', 'Explorar', 'Perfil'].entries()) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }))
      await settle()
      expect(screen.getByRole('dialog', { name: `Guía de Moni: ${title === 'Perfil' ? 'Tu perfil' : title}` })).toBeInTheDocument()
      expect(screen.getByTestId('path')).toHaveTextContent(route[i] as string)
      expect(screen.getByRole('button', { name: 'Omitir guía' })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Finalizar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(status.save).toHaveBeenCalledWith('completed')
    expect(shouldAutoShowGuide('u1')).toBe(false)
  })

  it('"Omitir guía" closes it at any step and saves "skipped"', async () => {
    mountTargets()
    markGuidePending('u1')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    await settle()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await settle()
    await user.click(screen.getByRole('button', { name: 'Omitir guía' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(status.save).toHaveBeenCalledWith('skipped')
    expect(shouldAutoShowGuide('u1')).toBe(false)
  })

  it('skips a step whose element does not show up for this person', async () => {
    mountTargets(['perfil', 'h1'])
    markGuidePending('u1')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    await settle()
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }))
      await settle()
    }
    expect(screen.getByRole('dialog', { name: 'Guía de Moni: Explorar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await act(async () => void (await vi.advanceTimersByTimeAsync(4000)))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(status.save).toHaveBeenCalledWith('completed')
  })

  it('"Conocé Moni" starts it again, never overwriting the saved answer', async () => {
    mountTargets()
    status.value = 'completed'
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup('/cuentas')
    await act(async () => requestGuide())
    await settle()
    expect(screen.getByRole('dialog', { name: 'Guía de Moni: Inicio' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Omitir guía' }))
    expect(status.save).not.toHaveBeenCalled()
  })
})
