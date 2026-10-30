import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
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

function renderPage() {
  render(
    <MemoryRouter>
      <MorePage />
    </MemoryRouter>,
  )
}

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

  it('with a credit card, "Tarjetas de crédito" leads to /tarjetas', () => {
    accountsData.current = [makeAccount({ id: 'v', name: 'Visa', kind: 'credit_card' })]
    renderPage()
    const tile = screen.getByRole('link', { name: /Tarjetas de crédito/ })
    expect(tile).toHaveAttribute('href', '/tarjetas')
    expect(tile).toHaveTextContent('Resúmenes, límite y cuotas')
  })

  it('without a card the same tile offers to add one from Medios de pago', () => {
    accountsData.current = [makeAccount({ id: 'c', name: 'Efectivo' })]
    renderPage()
    const tile = screen.getByRole('link', { name: /Tarjetas de crédito/ })
    expect(tile).toHaveAttribute('href', '/cuentas')
    expect(tile).toHaveTextContent('Agregá una desde Medios de pago')
  })

  it('keeps Medios de pago next to it', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^Medios de pago/ })).toHaveAttribute('href', '/cuentas')
  })
})
