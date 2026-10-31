import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { AccountsPage } from './AccountsPage'

vi.mock('../api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: [makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash', balanceCents: 1_000_00 })],
  }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({ useSavings: () => ({ data: undefined }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn(), openEdit: vi.fn() }),
}))
vi.mock('@/features/mpImport/ui/MpImportSection', () => ({
  MpImportSection: () => <div data-testid="mp-section" />,
}))

function renderPage(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <AccountsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('Medios de pago: Mercado Pago import', () => {
  it('hosts the Mercado Pago import section in the Medios tab', () => {
    renderPage('/cuentas')
    expect(screen.getByTestId('mp-section')).toBeInTheDocument()
  })

  it('does not show it in the cards or installments tabs', () => {
    renderPage('/cuentas?tab=tarjetas')
    expect(screen.queryByTestId('mp-section')).toBeNull()
  })
})
