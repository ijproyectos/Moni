import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FEATURES } from '@/shared/config/features'
import { MorePage } from './MorePage'

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

function renderPage() {
  render(
    <MemoryRouter>
      <MorePage />
    </MemoryRouter>,
  )
}

describe('MorePage navigation', () => {
  it('"Fijos y cuotas" became "Pagos recurrentes" (suscripciones y gastos fijos)', () => {
    renderPage()
    const tile = screen.getByRole('link', { name: /Pagos recurrentes/ })
    expect(tile).toHaveAttribute('href', '/recurrentes')
    expect(tile).toHaveTextContent('Suscripciones y gastos fijos')
    expect(screen.queryByText('Fijos y cuotas')).toBeNull()
  })

  it('"Gastos hormiga" shows the ant icon and the new subtitle', () => {
    renderPage()
    const tile = screen.getByRole('link', { name: /Gastos hormiga/ })
    expect(tile).toHaveAttribute('href', '/hormigas')
    expect(tile).toHaveTextContent('Esos gustitos que suman')
    expect(tile).not.toHaveTextContent('Lo chico que se repite')
    expect(tile.querySelector('svg.lucide-ant')).not.toBeNull()
  })

  it('"Medios de pago" is the one tile for accounts and cards: new subtitle, it leads to /cuentas', () => {
    renderPage()
    const tile = screen.getByRole('link', { name: /^Medios de pago/ })
    expect(tile).toHaveAttribute('href', '/cuentas')
    expect(tile).toHaveTextContent('Administrá tus cuentas y tarjetas')
    expect(tile).not.toHaveTextContent('Tarjetas, alias y efectivo')
  })

  it('there is no separate "Tarjetas de crédito" tile any more (the cards live inside Medios de pago)', () => {
    renderPage()
    expect(screen.queryByRole('link', { name: /Tarjetas de crédito/ })).toBeNull()
    expect(screen.getAllByRole('link', { name: /Medios de pago/ })).toHaveLength(1)
  })

  it('hides the screens without a backend: Pro, referral, Integraciones, Deudas and Aguinaldo', () => {
    renderPage()
    for (const name of [/Moni Pro/, /Recomendá Moni/, /Integraciones/, /Deudas/, /Aguinaldo/]) {
      expect(screen.queryByRole('link', { name })).toBeNull()
    }
    expect(screen.queryByText(/2 meses de Pro/)).toBeNull()
  })

  it('shows them again when their flags are on', () => {
    Object.assign(FEATURES, { pro: true, referral: true, debts: true, aguinaldo: true })
    try {
      renderPage()
      expect(screen.getByRole('link', { name: /Probá Moni Pro/ })).toHaveAttribute('href', '/pro')
      expect(screen.getByRole('link', { name: /Recomendá Moni/ })).toHaveAttribute(
        'href',
        '/recomendar',
      )
      expect(screen.getByRole('link', { name: /Deudas/ })).toHaveAttribute('href', '/deudas')
      expect(screen.getByRole('link', { name: /Aguinaldo/ })).toHaveAttribute('href', '/aguinaldo')
    } finally {
      Object.assign(FEATURES, { pro: false, referral: false, debts: false, aguinaldo: false })
    }
  })
})
