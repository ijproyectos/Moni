import { render, screen, waitFor } from '@testing-library/react'
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

async function goToCategories() {
  const user = renderFlow()
  await user.click(screen.getByRole('button', { name: /Saber en qué se me va la plata/ }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(
    screen.getByRole('heading', { name: 'Jonatan, así te va a ayudar Moni' }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Seguir' }))
  await user.click(screen.getByRole('button', { name: 'Seguir' }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  await user.click(screen.getByRole('checkbox', { name: /También uso dólares/ }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  return user
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    mutateAsync.mockClear()
    window.sessionStorage.clear()
  })

  it('shows the selected category count and blocks continuing without categories', async () => {
    const user = await goToCategories()
    expect(screen.getByRole('button', { name: 'Continuar · 3 elegidas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Comida' }))
    expect(screen.getByRole('button', { name: 'Continuar · 2 elegidas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seleccionar todas' }))
    await user.click(screen.getByRole('button', { name: 'Quitar todas' }))
    expect(screen.getByRole('button', { name: 'Continuar · 0 elegidas' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí al menos una categoría')
  })

  it('goes back to the previous step keeping the answers', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('checkbox', { name: /También uso dólares/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('saves every answer at the end and goes home', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Sueldo' }))
    await user.click(screen.getByRole('button', { name: /Crear/ }))
    await user.type(screen.getByLabelText('Nombre'), 'Gimnasio')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar · 3 elegidas' }))
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
  })

  it('has no Pro paywall step while the pro flag is off, even from a deep link', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Continuar · 3 elegidas' }))
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    expect(screen.queryByRole('button', { name: 'Ahora no' })).toBeNull()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  })

  it('shows the Pro paywall as the last step when the pro flag is on', async () => {
    FEATURES.pro = true
    try {
      const user = await goToCategories()
      await user.click(screen.getByRole('button', { name: 'Continuar · 3 elegidas' }))
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
    await user.click(screen.getByRole('button', { name: 'Continuar · 3 elegidas' }))
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })

  describe('Omitir', () => {
    const defaults = {
      goals: [],
      templateSlugs: ['comida', 'super', 'sueldo'],
      customCategories: [],
      secondaryCurrency: null,
      notificationsOptIn: null,
    }

    it('shows only three benefit slides, with Omitir on every one including the last', async () => {
      const user = renderFlow()
      await user.click(screen.getByRole('button', { name: /Saber en qué se me va la plata/ }))
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      expect(
        screen
          .getAllByRole('listitem')
          .filter((li) => /de 3$/.test(li.getAttribute('aria-label') ?? '')),
      ).toHaveLength(3)
      expect(screen.getByRole('button', { name: 'Omitir' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Seguir' }))
      await user.click(screen.getByRole('button', { name: 'Seguir' }))
      expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Omitir' })).toBeInTheDocument()
    })

    it('finishes with defaults from the benefits step', async () => {
      const user = renderFlow()
      await user.click(screen.getByRole('button', { name: /Saber en qué se me va la plata/ }))
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      await user.click(screen.getByRole('button', { name: 'Omitir' }))
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(defaults))
      expect(await screen.findByText('home')).toBeInTheDocument()
    })

    it('ignores earlier answers when skipping from the currency step', async () => {
      const user = renderFlow()
      await user.click(screen.getByRole('button', { name: /Saber en qué se me va la plata/ }))
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      await user.click(screen.getByRole('button', { name: 'Seguir' }))
      await user.click(screen.getByRole('button', { name: 'Seguir' }))
      await user.click(screen.getByRole('button', { name: 'Continuar' }))
      await user.click(screen.getByRole('checkbox', { name: /También uso dólares/ }))
      await user.click(screen.getByRole('button', { name: 'Omitir' }))
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(defaults))
    })

    it('finishes with defaults from the categories step even with a custom selection', async () => {
      const user = await goToCategories()
      await user.click(screen.getByRole('button', { name: 'Comida' }))
      await user.click(screen.getByRole('button', { name: 'Omitir' }))
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(defaults))
      expect(await screen.findByText('home')).toBeInTheDocument()
    })

    it('finishes with defaults from the notifications step, bypassing the paywall', async () => {
      const user = await goToCategories()
      await user.click(screen.getByRole('button', { name: 'Continuar · 3 elegidas' }))
      await user.click(screen.getByRole('button', { name: 'Omitir' }))
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(defaults))
      expect(await screen.findByText('home')).toBeInTheDocument()
    })

    it('shows an error and stays when saving the skip fails', async () => {
      mutateAsync.mockRejectedValueOnce(new Error('offline'))
      const user = await goToCategories()
      await user.click(screen.getByRole('button', { name: 'Omitir' }))
      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.queryByText('home')).not.toBeInTheDocument()
    })
  })
})
