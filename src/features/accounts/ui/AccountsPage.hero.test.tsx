import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { AccountsPage } from './AccountsPage'

vi.mock('../api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: [
      makeAccount({ id: 'g', name: 'Galicia', kind: 'bank', balanceCents: 640_000_00 }),
      makeAccount({ id: 'e', name: 'Efectivo', kind: 'cash', balanceCents: 23_500_00 }),
      makeAccount({ id: 'v', name: 'Visa', kind: 'credit_card', balanceCents: -90_000_00, creditLimitCents: 500_000_00 }),
    ],
  }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({ useSavings: () => ({ data: undefined }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/mpImport/ui/MpImportSection', () => ({ MpImportSection: () => null }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn(), openEdit: vi.fn() }),
}))

describe('Medios de pago hero and sections', () => {
  it('sums the accounts without credit cards and groups the rows', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AccountsPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    const hero = screen.getByRole('region', { name: 'Saldo en cuentas' })
    expect(hero).toHaveTextContent('$663.500')
    expect(hero).toHaveTextContent('Sin contar tarjetas de crédito')
    const wallets = screen.getByRole('list', { name: 'Cuentas y billeteras' })
    expect(within(wallets).getAllByRole('button')).toHaveLength(2)
    const cards = screen.getByRole('list', { name: 'Tarjetas de crédito' })
    expect(within(cards).getByRole('button', { name: 'Abrir Visa' })).toHaveTextContent('Deuda')
    expect(screen.getByText('3 medios')).toBeInTheDocument()
  })
})
