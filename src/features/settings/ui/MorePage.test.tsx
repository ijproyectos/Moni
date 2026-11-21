import { render, screen } from '@testing-library/react'
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

describe('Explorar', () => {
  beforeEach(() => {
    accountsData.current = []
    subsData.current = []
    antsData.current = 0
    budgetData.current = { kind: 'sin-datos' }
  })

  it('has the header and the six sections, each a whole link to its tool', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Explorar' })).toBeInTheDocument()
    expect(screen.getByText('Tu plata de un vistazo')).toBeInTheDocument()
    const link = (re: RegExp, href: string) => expect(screen.getByRole('link', { name: re })).toHaveAttribute('href', href)
    link(/^Metas de ahorro/, '/metas')
    link(/^Presupuesto/, '/presupuesto')
    link(/^Pagos recurrentes/, '/recurrentes')
    link(/^Gastos hormiga/, '/hormigas')
    link(/^Informes/, '/este-mes')
    link(/^Viajes/, '/viajes')
    expect(screen.queryByRole('button', { name: 'Hablá con Moni' })).toBeNull()
  })

  it('shows only the six tools: no ¿Me conviene?, simulator, Categorías or Avisos, and no empty "Más"', () => {
    renderPage()
    expect(screen.getAllByRole('link')).toHaveLength(6)
    for (const name of [/Categorías/, /Simulador/, /Avisos de Moni/, /Tarjetas de crédito|^Medios de pago/]) {
      expect(screen.queryByRole('link', { name })).toBeNull()
    }
    expect(screen.queryByRole('button', { name: /¿Me conviene\?/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Más' })).toBeNull()
  })

  it('"Pagos recurrentes" adds up only the active monthly subscriptions', () => {
    subsData.current = [
      { id: 'a', status: 'active', period: 'monthly', amountCents: 10_000_00 },
      { id: 'b', status: 'active', period: 'monthly', amountCents: 5_000_00 },
      { id: 'c', status: 'active', period: 'yearly', amountCents: 90_000_00 },
      { id: 'd', status: 'paused', period: 'monthly', amountCents: 7_000_00 },
    ]
    renderPage()
    const tile = screen.getByRole('link', { name: /^Pagos recurrentes/ })
    expect(tile).toHaveTextContent('$15.000')
    expect(tile).toHaveTextContent('2 cobros por mes')
  })

  it('shows the real ants and a budget that was exceeded', () => {
    antsData.current = 12_500_00
    budgetData.current = { kind: 'ok', spendBudgetCents: 800_000_00, overCents: 75_000_00, remainingCents: -75_000_00 }
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('$12.500este mes')
    const budget = screen.getByRole('link', { name: /^Presupuesto/ })
    expect(budget).toHaveTextContent('-$75.000te pasaste')
  })

  it('shows what is left of the budget when it was not exceeded', () => {
    budgetData.current = { kind: 'ok', spendBudgetCents: 800_000_00, overCents: 0, remainingCents: 120_000_00 }
    renderPage()
    expect(screen.getByRole('link', { name: /^Presupuesto/ })).toHaveTextContent('$120.000te queda')
  })

  it('says "sin hormigas" and does not invent a budget without data', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('sin hormigas')
    expect(screen.getByRole('link', { name: /^Presupuesto/ })).toHaveTextContent('armá tu presupuesto')
  })
})
