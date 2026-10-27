import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { OnboardingPage } from './OnboardingPage'

const mutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/features/auth/api/useProfile', () => ({
  useProfile: () => ({ data: { display_name: 'Jonatan Rios' } }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategoryTemplates: () => ({
    isError: false,
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

async function goToCategories() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: /Saber en qué se me va la plata/ }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(
    screen.getByRole('heading', { name: 'Jonatan, así te va a ayudar Moni' }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '¡De una!' }))
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
  return user
}

describe('OnboardingPage', () => {
  beforeEach(() => mutateAsync.mockClear())

  it('shows the selected category count and updates it as chips are toggled', async () => {
    const user = await goToCategories()
    expect(screen.getByRole('button', { name: 'Continuar · 3 elegidas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Comida' }))
    expect(screen.getByRole('button', { name: 'Continuar · 2 elegidas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seleccionar todas' }))
    expect(screen.getByRole('button', { name: 'Continuar · 3 elegidas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar todas' }))
    expect(screen.getByRole('button', { name: 'Continuar · 0 elegidas' })).toBeDisabled()
  })

  it('completes onboarding with goals and chosen slugs, then goes home', async () => {
    const user = await goToCategories()
    await user.click(screen.getByRole('button', { name: 'Sueldo' }))
    await user.click(screen.getByRole('button', { name: 'Continuar · 2 elegidas' }))
    expect(mutateAsync).toHaveBeenCalledWith({
      goals: ['track_spending'],
      templateSlugs: ['comida', 'super'],
    })
    expect(await screen.findByText('home')).toBeInTheDocument()
  })
})
