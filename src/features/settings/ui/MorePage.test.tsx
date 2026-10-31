import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import { FEATURES } from '@/shared/config/features'
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

describe('MorePage plan badge', () => {
  beforeEach(() => {
    plusState.isPlus = false
    plusState.isLoading = false
  })

  it('shows "Plan gratis" for a free person', () => {
    renderPage()
    expect(screen.getByText('Plan gratis')).toBeInTheDocument()
  })

  it('shows "Moni Plus" instead of "Plan gratis" when Plus is active', () => {
    plusState.isPlus = true
    renderPage()
    expect(screen.getByText('Moni Plus')).toBeInTheDocument()
    expect(screen.queryByText('Plan gratis')).toBeNull()
  })

  it('shows no plan badge while the plan is still loading', () => {
    plusState.isLoading = true
    renderPage()
    expect(screen.queryByText('Plan gratis')).toBeNull()
    expect(screen.queryByText('Moni Plus')).toBeNull()
  })
})

describe('MorePage navigation', () => {
  beforeEach(() => {
    accountsData.current = []
  })

  it('"Fijos y cuotas" became "Pagos recurrentes" (suscripciones y gastos fijos)', () => {
    renderPage()
    const tile = screen.getByRole('link', { name: /Pagos recurrentes/ })
    expect(tile).toHaveAttribute('href', '/recurrentes')
    expect(tile).toHaveTextContent('Suscripciones y gastos fijos')
    expect(screen.queryByText('Fijos y cuotas')).toBeNull()
  })

  it('has no standalone "Tarjetas de crédito" tile, with or without a card: cards live in Medios de pago', () => {
    for (const accounts of [
      [makeAccount({ id: 'v', name: 'Visa', kind: 'credit_card' })],
      [makeAccount({ id: 'c', name: 'Efectivo' })],
    ]) {
      accountsData.current = accounts
      const { unmount } = render(
        <MemoryRouter>
          <MorePage />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('link', { name: /Tarjetas de crédito/ })).toBeNull()
      expect(screen.queryByRole('link', { name: /^Medios de pago/ })).toHaveTextContent(
        'Administrá tus cuentas y tarjetas',
      )
      unmount()
    }
  })

  it('"Gastos hormiga" shows the ant icon and the new subtitle', () => {
    renderPage()
    const tile = screen.getByRole('link', { name: /Gastos hormiga/ })
    expect(tile).toHaveAttribute('href', '/hormigas')
    expect(tile).toHaveTextContent('Esos gustitos que suman')
    expect(tile).not.toHaveTextContent('Lo chico que se repite')
    expect(tile.querySelector('svg.lucide-ant')).not.toBeNull()
  })

  it('keeps Medios de pago next to it', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^Medios de pago/ })).toHaveAttribute(
      'href',
      '/cuentas',
    )
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
