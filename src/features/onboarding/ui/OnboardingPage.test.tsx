import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
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
  await user.click(screen.getByRole('button', { name: 'Saltar' }))
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
    expect(mutateAsync).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Ahora no' }))
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

  it('keeps the person on the last screen with an error when saving fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('offline'))
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Continuar · 3 elegidas' }))
    await user.click(screen.getByRole('button', { name: 'Más tarde' }))
    await user.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })
})
