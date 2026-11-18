import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Account } from '@/features/accounts/domain/account'
import { MorePage } from './MorePage'

const accountsData = vi.hoisted(() => ({ current: [] as Account[] }))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: accountsData.current }),
}))
vi.mock('@/features/auth/api/authContext', () => ({
  useAuth: () => ({ user: { email: 'a@b.c' } }),
}))
vi.mock('@/features/auth/api/useProfile', () => ({
  useProfile: () => ({
    data: { display_name: 'Ana', avatar_url: null },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/features/onboarding/api/useGoals', () => ({
  useEnabledFeatures: () => ({ has: () => true }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({
  useSavings: () => ({ data: { goals: [] } }),
}))
vi.mock('@/features/subscriptions/api/useSubscriptions', () => ({
  useSubscriptions: () => ({ data: { subscriptions: subsData.current } }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({ data: [{ id: 'c', name: 'Comida', color: '#e5533d' }] }),
}))
vi.mock('@/features/trips/api/useTrips', () => ({ useTrips: () => ({ data: [] }) }))
vi.mock('@/features/insights/api/useAnts', () => ({
  useAnts: () => ({ data: { monthTotalCents: antsData.current } }),
}))
const subsData = vi.hoisted(() => ({ current: [] as unknown[] }))
const antsData = vi.hoisted(() => ({ current: 0 }))
const budgetData = vi.hoisted(() => ({ current: { kind: 'sin-datos' } as Record<string, unknown> }))
vi.mock('@/features/dashboard/api/useDailyAllowance', () => ({
  useDailyAllowance: () => ({ isLoading: false, allowance: budgetData.current, status: null, pace: null }),
}))
const plusState = vi.hoisted(() => ({ isPlus: false, isLoading: false }))
vi.mock('@/features/plus/api/usePlus', () => ({
  usePlus: () => ({ ...plusState, isFree: !plusState.isPlus, expiresAt: null }),
}))

function renderPage() {
  render(
    <MemoryRouter>
      <MorePage />
    </MemoryRouter>,
  )
}

describe('Herramientas', () => {
  beforeEach(() => {
    accountsData.current = []
    subsData.current = []
    antsData.current = 0
    budgetData.current = { kind: 'sin-datos' }
  })

  it('has the header, the carousel, Explorar and Con Moni', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Herramientas' })).toBeInTheDocument()
    expect(screen.getByText('Todo en un lugar')).toBeInTheDocument()
    const carousel = screen.getByRole('list', { name: 'Herramientas destacadas' })
    expect(within(carousel).getByRole('link', { name: /Pagos recurrentes/ })).toHaveAttribute('href', '/recurrentes')
    expect(within(carousel).getByRole('link', { name: /Informes/ })).toHaveAttribute('href', '/este-mes')
    expect(within(carousel).getByRole('link', { name: /Metas de ahorro/ })).toHaveAttribute('href', '/metas')
    expect(screen.getByRole('link', { name: /^Categorías/ })).toHaveAttribute('href', '/categorias')
    expect(screen.getByRole('link', { name: /^Viajes/ })).toHaveAttribute('href', '/viajes')
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveAttribute('href', '/hormigas')
    expect(screen.getByRole('link', { name: /^Presupuesto/ })).toHaveAttribute('href', '/presupuesto')
    expect(screen.queryByRole('link', { name: 'Ver mi perfil' })).toBeNull()
  })

  it('has no standalone cards tile (Tarjetas is in the bottom bar)', () => {
    renderPage()
    expect(screen.queryByRole('link', { name: /Tarjetas de crédito|^Medios de pago/ })).toBeNull()
  })

  it('"Pagos recurrentes" adds up only the active monthly subscriptions', () => {
    subsData.current = [
      { id: 'a', status: 'active', period: 'monthly', amountCents: 10_000_00 },
      { id: 'b', status: 'active', period: 'monthly', amountCents: 5_000_00 },
      { id: 'c', status: 'active', period: 'yearly', amountCents: 90_000_00 },
      { id: 'd', status: 'paused', period: 'monthly', amountCents: 7_000_00 },
    ]
    renderPage()
    const tile = screen.getByRole('link', { name: /Pagos recurrentes/ })
    expect(tile).toHaveTextContent('2')
    expect(tile).toHaveTextContent('cobros por mes · $15.000')
  })

  it('shows real secondary info: ants, budget', () => {
    antsData.current = 12_500_00
    budgetData.current = { kind: 'ok', spendBudgetCents: 800_000_00, overCents: 75_000_00 }
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('$12.500 este mes')
    expect(screen.getByRole('link', { name: /^Presupuesto/ })).toHaveTextContent('te pasaste $75.000')
  })

  it('says "Sin hormigas" and does not invent a budget without data', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('Sin hormigas')
    expect(screen.getByRole('link', { name: /^Presupuesto/ })).toHaveTextContent('Consultá y administrá')
  })

  it('has no "Con Moni" chips nor Pro / referral cards below Explorar', () => {
    renderPage()
    expect(screen.queryByText('Con Moni')).toBeNull()
    expect(screen.queryByRole('button', { name: '¿Me conviene?' })).toBeNull()
  })

  it('has no "Más herramientas": every tool is in the carousel or in Explorar, including insights and the simulator', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /Más herramientas/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Avisos de Moni/ })).toHaveAttribute('href', '/insights')
    expect(screen.getByRole('link', { name: /Simulador de cuotas/ })).toHaveAttribute('href', '/tarjetas/simulador')
  })
})
