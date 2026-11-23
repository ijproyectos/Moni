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
const ahorrosData = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('@/features/ahorros/api/useAhorros', () => ({
  useAhorros: () => ({ data: ahorrosData.current, isLoading: false }),
}))
vi.mock('@/features/health/api/useFinancialHealth', () => ({
  useFinancialHealth: () => ({ isLoading: false, score: { kind: 'ok', score: 68, band: 'good' } }),
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
    ahorrosData.current = []
  })

  it('has the header and the long cards (Metas, Ahorros, Categorías, Salud) and the four tiles, each a whole link', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Explorar' })).toBeInTheDocument()
    expect(screen.getByText('Tu plata de un vistazo')).toBeInTheDocument()
    const link = (re: RegExp, href: string) => expect(screen.getByRole('link', { name: re })).toHaveAttribute('href', href)
    link(/^Metas de ahorro/, '/metas')
    link(/^Ahorros/, '/ahorros')
    link(/^Categorías/, '/categorias')
    link(/^Salud financiera/, '/salud')
    link(/^Pagos recurrentes/, '/recurrentes')
    link(/^Gastos hormiga/, '/hormigas')
    link(/^Informes/, '/este-mes')
    link(/^Viajes/, '/viajes')
    expect(screen.queryByRole('link', { name: /^Presupuesto/ })).toBeNull()
    expect(screen.getByRole('link', { name: /^Categorías/ })).toHaveTextContent(/Límite.*por mes/)
    expect(screen.getByRole('link', { name: /^Salud financiera/ })).toHaveTextContent('68 de 100')
    expect(screen.queryByRole('button', { name: 'Hablá con Moni' })).toBeNull()
  })

  it('shows the savings of each currency separately, never mixed, and an empty state without them', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^Ahorros/ })).toHaveTextContent('Pesos y dólares')
    ahorrosData.current = [
      { id: '1', currency: 'ARS', kind: 'opening', amountCents: 150_000_00, status: 'posted' },
      { id: '2', currency: 'USD', kind: 'opening', amountCents: 300_00, status: 'posted' },
    ]
    renderPage()
    const tiles = screen.getAllByRole('link', { name: /^Ahorros/ })
    expect(tiles[tiles.length - 1]).toHaveTextContent('$150.000')
    expect(tiles[tiles.length - 1]).toHaveTextContent('US$ 300')
  })

  it('shows only the tools: no ¿Me conviene?, simulator or Avisos, and no empty "Más"', () => {
    renderPage()
    expect(screen.getAllByRole('link')).toHaveLength(8)
    for (const name of [/Simulador/, /Avisos de Moni/, /Tarjetas de crédito|^Medios de pago/]) {
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

  it('shows the real ants', () => {
    antsData.current = 12_500_00
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('$12.500este mes')
  })

  it('says "sin hormigas" and does not invent a budget without data', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('sin hormigas')
    expect(screen.getByRole('link', { name: /^Metas de ahorro/ })).toHaveTextContent('Creá tu primera meta')
    expect(screen.getByRole('link', { name: /^Viajes/ })).toHaveTextContent('todavía no tenés viajes')
    expect(screen.getByRole('link', { name: /^Pagos recurrentes/ })).toHaveTextContent('no tenés pagos próximos')
    // None of the example figures of the design may show up as if they were real.
    expect(document.body).not.toHaveTextContent(/201\.866|Bariloche|\$30\.000/)
  })
})
