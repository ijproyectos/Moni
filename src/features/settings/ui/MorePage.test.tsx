import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
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
const currencyData = vi.hoisted(() => ({ usesUsd: true }))
vi.mock('@/features/settings/api/useSecondaryCurrency', () => ({
  useSecondaryCurrency: () => ({ usesUsd: currencyData.usesUsd }),
}))
vi.mock('@/features/health/api/useFinancialHealth', () => ({
  useFinancialHealth: () => ({ isLoading: false, score: { kind: 'ok', score: 68, band: 'bien' } }),
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
    plusState.isPlus = true
    currencyData.usesUsd = true
  })

  it('has the header and the long cards (Ahorros y metas, Categorías, Salud) and the tiles, each a whole link', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Explorar' })).toBeInTheDocument()
    expect(screen.getByText('Tu plata de un vistazo')).toBeInTheDocument()
    const link = (re: RegExp, href: string) => expect(screen.getByRole('link', { name: re })).toHaveAttribute('href', href)
    link(/^Ahorros y metas/, '/ahorros-y-metas')
    link(/^Categorías/, '/categorias')
    link(/^Salud financiera/, '/salud')
    link(/^Pagos recurrentes/, '/recurrentes')
    link(/^Gastos hormiga/, '/hormigas')
    link(/^Informes/, '/este-mes')
    link(/^Viajes/, '/viajes')
    expect(screen.queryByRole('link', { name: /^Presupuesto/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Metas de ahorro$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Ahorros$/ })).toBeNull()
    expect(screen.getByRole('link', { name: /^Categorías/ })).toHaveTextContent(/Límite.*por mes/)
    expect(screen.getByRole('link', { name: /^Salud financiera/ })).toHaveTextContent('68 de 100')
    expect(screen.queryByRole('button', { name: 'Hablá con Moni' })).toBeNull()
  })

  it('shows what was saved in the unified card, favoring USD when there is some, with an empty-state hint', () => {
    ahorrosData.current = [{ id: '1', currency: 'ARS', kind: 'opening', amountCents: 150_000_00, status: 'posted' }]
    renderPage()
    expect(screen.getByRole('link', { name: /^Ahorros y metas/ })).toHaveTextContent('$150.000 ahorrados')

    cleanup()
    ahorrosData.current = [
      { id: '1', currency: 'ARS', kind: 'opening', amountCents: 150_000_00, status: 'posted' },
      { id: '2', currency: 'USD', kind: 'opening', amountCents: 300_00, status: 'posted' },
    ]
    renderPage()
    expect(screen.getByRole('link', { name: /^Ahorros y metas/ })).toHaveTextContent('US$ 300')

    cleanup()
    ahorrosData.current = []
    renderPage()
    expect(screen.getByRole('link', { name: /^Ahorros y metas/ })).toHaveTextContent('Pesos y dólares')

    cleanup()
    currencyData.usesUsd = false
    renderPage()
    const empty = screen.getByRole('link', { name: /^Ahorros y metas/ })
    expect(empty).not.toHaveTextContent('dólares')
    expect(empty).toHaveTextContent('Creá tu primera meta')
  })

  it('shows only the tools: no ¿Me conviene?, simulator or Avisos, and no empty "Más"', () => {
    renderPage()
    expect(screen.getAllByRole('link')).toHaveLength(7)
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
    currencyData.usesUsd = false
    renderPage()
    expect(screen.getByRole('link', { name: /^Gastos hormiga/ })).toHaveTextContent('sin hormigas')
    expect(screen.getByRole('link', { name: /^Ahorros y metas/ })).toHaveTextContent('Creá tu primera meta')
    expect(screen.getByRole('link', { name: /^Viajes/ })).toHaveTextContent('todavía no tenés viajes')
    expect(screen.getByRole('link', { name: /^Pagos recurrentes/ })).toHaveTextContent('no tenés pagos próximos')
    // None of the example figures of the design may show up as if they were real.
    expect(document.body).not.toHaveTextContent(/201\.866|Bariloche|\$30\.000/)
  })

  describe('Free plan', () => {
    beforeEach(() => {
      plusState.isPlus = false
    })

    it('keeps every card, puts the small PLUS label only on Salud, Pagos recurrentes, Gastos hormiga and Informes', () => {
      renderPage()
      for (const name of [/Salud financiera/, /Pagos recurrentes/, /Gastos hormiga/, /Informes/]) {
        expect(screen.getByRole('button', { name })).toHaveTextContent('PLUS')
      }
      for (const name of [/^Ahorros y metas/, /^Categorías/, /^Viajes/]) {
        const card = screen.getByRole('link', { name })
        expect(card).not.toHaveTextContent('PLUS')
      }
      expect(document.querySelectorAll('[data-plus-tag]')).toHaveLength(4)
    })

    it('tapping a Plus card opens its own promo and goes nowhere', async () => {
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: /Gastos hormiga/ }))
      expect(screen.getByRole('dialog', { name: 'Los pequeños gastos también cuentan' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
      await userEvent.click(screen.getByRole('button', { name: /Salud financiera/ }))
      expect(screen.getByRole('dialog', { name: 'Descubrí cómo están tus finanzas' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
      await userEvent.click(screen.getByRole('button', { name: /Informes/ }))
      expect(screen.getByRole('dialog', { name: 'Entendé mejor tus números' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
      await userEvent.click(screen.getByRole('button', { name: /Pagos recurrentes/ }))
      expect(screen.getByRole('dialog', { name: 'Que ningún pago te sorprenda' })).toBeInTheDocument()
    })

    it('Moni Plus sees no labels at all and the cards are plain links', () => {
      plusState.isPlus = true
      renderPage()
      expect(document.querySelectorAll('[data-plus-tag]')).toHaveLength(0)
      expect(screen.getByRole('link', { name: /^Salud financiera/ })).toHaveAttribute('href', '/salud')
    })
  })
})
