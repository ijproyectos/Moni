import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { FEATURES } from '@/shared/config/features'
import { OnboardingPage } from './OnboardingPage'

const mutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/features/auth/api/authContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, isLoading: false }),
}))
vi.mock('@/features/auth/api/useProfile', () => ({
  useProfile: () => ({ data: { display_name: 'Jonatan Rios' } }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategoryTemplates: () => ({
    isError: false,
    isLoading: false,
    data: [
      {
        slug: 'comida',
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        sortOrder: 10,
      },
      {
        slug: 'super',
        kind: 'expense',
        name: 'Súper',
        icon: 'ShoppingCart',
        color: '#064735',
        sortOrder: 20,
      },
      {
        slug: 'sueldo',
        kind: 'income',
        name: 'Sueldo',
        icon: 'Wallet',
        color: '#0E8A6D',
        sortOrder: 30,
      },
    ],
  }),
}))
vi.mock('../api/useCompleteOnboarding', () => ({
  useCompleteOnboarding: () => ({ mutateAsync, isPending: false }),
}))

function renderFlow() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

const GOAL = /Saber en qué se me va la plata/

/** Goals → benefits (one screen, one "Continuar") → currency. */
async function throughBenefits(user: ReturnType<typeof renderFlow>) {
  await user.click(screen.getByRole('button', { name: GOAL }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByRole('heading', { name: 'Jonatan, así te va a ayudar Moni' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
}

async function goToCategories() {
  const user = renderFlow()
  await throughBenefits(user)
  await user.click(screen.getByRole('checkbox', { name: /También uso dólares/ }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  return user
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    mutateAsync.mockClear()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('the goals step cannot be skipped: it needs at least one goal', async () => {
    const user = renderFlow()
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Omitir configuración' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: GOAL }))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: GOAL }))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('"Todo lo anterior" selects every goal', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: 'Todo lo anterior' }))
    expect(screen.getByRole('button', { name: GOAL })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
  })

  it('a deep link cannot skip the goals', () => {
    render(
      <MemoryRouter initialEntries={['/onboarding?paso=4']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '¿Qué querés lograr con Moni?' })).toBeInTheDocument()
  })

  it('the benefits are a carousel of four cards with position dots, the chosen goal first, and a single Continuar', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: /Dividir gastos con mi pareja o amigos/ }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    const list = screen.getByRole('list', { name: 'Beneficios de Moni' })
    const cards = Array.from(list.querySelectorAll('li'))
    expect(cards).toHaveLength(4)
    expect(cards[0]).toHaveAccessibleName('1 de 4')
    expect(cards[0]?.querySelector('h2')?.textContent).toBe('Dividí sin hacer cuentas')
    expect(list).toHaveTextContent('Control de gastos')
    expect(list).toHaveTextContent('Ahorros y metas')
    expect(list).toHaveTextContent('Agente financiero')
    expect(screen.getAllByText('Elegiste esto')).toHaveLength(1)
    const dots = within(screen.getByRole('group', { name: 'Posición' })).getAllByRole('button')
    expect(dots).toHaveLength(4)
    expect(dots[0]).toHaveAttribute('aria-current', 'true')
    await user.click(dots[2] as HTMLElement)
    expect(dots[2]).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Omitir configuración' })).toBeNull()
  })

  it('the screen takes the tint of the card on view', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: /Saber en qué se me va la plata/ }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('main').style.getPropertyValue('--ob-light')).toBe('#dce9c8')
  })

  it('the currency step has no skip and keeps pesos only unless dollars are turned on', async () => {
    const user = renderFlow()
    await throughBenefits(user)
    expect(screen.getByRole('heading', { name: '¿En qué moneda manejás tu plata?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Omitir configuración' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('heading', { name: 'Elegí tus categorías' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('checkbox', { name: /También uso dólares/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('categories: Explorar wording, a plain Continuar and an easy way back to the suggested ones', async () => {
    const user = await goToCategories()
    expect(screen.getByText(/Explorar › Categorías/)).toBeInTheDocument()
    expect(screen.queryByText(/Más › Categorías/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Omitir configuración' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Quitar todas' }))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí al menos una categoría')
    await user.click(screen.getByRole('button', { name: 'Usar las sugeridas' }))
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('goes back to the previous step keeping the answers', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('checkbox', { name: /También uso dólares/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('has no income step: categories go straight to the notifications screen', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.queryByRole('heading', { name: '¿Cuánto cobrás por mes?' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Que no se te escape nada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar notificaciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Más tarde' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Omitir configuración' })).toBeNull()
  })

  it('saves every answer at the end, marks the guide to open and goes home', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Sueldo' }))
    await user.click(screen.getByRole('button', { name: /Crear/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Gimnasio')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledWith({
      goals: ['track_spending'],
      templateSlugs: ['comida', 'super'],
      customCategories: [expect.objectContaining({ name: 'Gimnasio', kind: 'expense' })],
      secondaryCurrency: 'USD',
      notificationsOptIn: false,
    })
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(window.localStorage.getItem('moni:guide-pending:user-1')).toBe('1')
  })

  it('does not ask the browser for notification permission until "Activar notificaciones" is tapped', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    try {
      const user = await goToCategories()
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      expect(requestPermission).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Más tarde' }))
      expect(requestPermission).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('has no Pro paywall step while the pro flag is off, even from a deep link', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    expect(screen.queryByRole('button', { name: 'Ahora no' })).toBeNull()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  })

  it('shows the Pro paywall as the last step when the pro flag is on', async () => {
    FEATURES.pro = true
    try {
      const user = await goToCategories()
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      await user.click(screen.getByRole('button', { name: 'Más tarde' }))
      expect(mutateAsync).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Ahora no' })).toBeInTheDocument()
    } finally {
      FEATURES.pro = false
    }
  })

  it('keeps the person on the last screen with an error when saving fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('offline'))
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('home')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('moni:guide-pending:user-1')).toBeNull()
  })

  describe('design', () => {
    it('the progress bar has one segment per step (5) and fills the ones reached', async () => {
      const user = renderFlow()
      const bar = () => screen.getByRole('progressbar', { name: 'Progreso' })
      expect(bar().children).toHaveLength(5)
      expect(bar()).toHaveAttribute('aria-valuenow', '1')
      await user.click(screen.getByRole('button', { name: GOAL }))
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      expect(bar()).toHaveAttribute('aria-valuenow', '2')
    })

    it('the dollar row lights up only when the second currency is chosen', async () => {
      const user = renderFlow()
      await throughBenefits(user)
      const usd = () => screen.getByLabelText(/Dólar, USD/)
      expect(usd()).toHaveAttribute('aria-label', 'Segunda moneda disponible: Dólar, USD')
      await user.click(screen.getByRole('checkbox', { name: /También uso dólares/ }))
      expect(usd()).toHaveAttribute('aria-label', 'Segunda moneda: Dólar, USD')
    })
  })
})
