import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { makeSavings, makeSavingsAccount } from '@/features/goals/domain/testing'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { AccountsPage } from './AccountsPage'

const savings = vi.hoisted(() => ({ data: null as unknown }))

vi.mock('../api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: [
      makeAccount({ id: 'galicia', name: 'Galicia', kind: 'bank', balanceCents: 150_000_00 }),
      makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash', balanceCents: 10_000_00 }),
      makeAccount({ id: 'visa', name: 'Visa', kind: 'credit_card', balanceCents: -50_000_00 }),
    ],
  }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({ useSavings: () => ({ data: savings.data }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn(), openEdit: vi.fn() }),
}))

function renderPage() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AccountsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('Medios de pago: what each account reserves for savings goals', () => {
  it('shows the reserved and the free money next to the real balance of an account with goals', () => {
    savings.data = makeSavings({
      accounts: [
        makeSavingsAccount({
          id: 'galicia',
          balanceCents: 150_000_00,
          reservedCents: 30_000_00,
          freeCents: 120_000_00,
        }),
      ],
    })
    renderPage()
    const line = screen.getByText(/Reservado para metas/)
    expect(line).toHaveTextContent('$30.000')
    expect(line).toHaveTextContent('libre $120.000')
    // The balance itself is the real one, untouched by the reserve.
    expect(screen.getByRole('button', { name: 'Editar Galicia' })).toHaveTextContent('$150.000')
  })

  it('marks an account whose balance no longer covers its reserves', () => {
    savings.data = makeSavings({
      accounts: [
        makeSavingsAccount({
          id: 'galicia',
          balanceCents: 20_000_00,
          reservedCents: 30_000_00,
          freeCents: -10_000_00,
        }),
      ],
    })
    renderPage()
    expect(screen.getByText(/Reservado para metas/)).toHaveTextContent('⚠ libre -$10.000')
  })

  it('accounts without reserves, and credit cards, show no reserve line', () => {
    savings.data = makeSavings({
      accounts: [makeSavingsAccount({ id: 'cash', reservedCents: 0, freeCents: 10_000_00 })],
    })
    renderPage()
    expect(screen.queryByText(/Reservado para metas/)).toBeNull()
  })

  it('still works while the goals have not loaded', () => {
    savings.data = undefined
    renderPage()
    expect(screen.getByRole('button', { name: 'Editar Galicia' })).toBeInTheDocument()
  })
})
