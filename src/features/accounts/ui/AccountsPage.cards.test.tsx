import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { AccountsPage } from './AccountsPage'

const accountsData = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock('../api/useAccounts', () => ({
  useAccounts: () => ({ isLoading: false, isError: false, data: accountsData.current }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({ useSavings: () => ({ data: null }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn(), openEdit: vi.fn() }),
}))
// The credit-card tools keep their own tests; here only the hosting matters.
vi.mock('@/features/cards/ui/CardsPanel', () => ({
  CardsPanel: () => <p>panel de tarjetas</p>,
}))
vi.mock('@/features/cards/ui/InstallmentsPanel', () => ({
  InstallmentsPanel: () => <p>panel de cuotas</p>,
}))
vi.mock('@/features/cards/ui/NewPurchaseSheet', () => ({
  NewPurchaseSheet: () => <div role="dialog" aria-label="nueva compra en cuotas" />,
}))
vi.mock('@/features/cards/ui/CardSummarySection', () => ({
  CardSummarySection: () => <p>resumen</p>,
}))

const cash = makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash' })
const visa = makeAccount({ id: 'visa', name: 'Visa', kind: 'credit_card', balanceCents: -1000_00 })

function renderAt(url = '/cuentas') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <AccountsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Medios de pago hosts the credit-card section', () => {
  it('with a credit card it offers Medios / Tarjetas / Cuotas, starting on Medios', () => {
    accountsData.current = [cash, visa]
    renderAt()
    expect(screen.getByRole('button', { name: 'Medios' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tarjetas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cuotas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir Visa' })).toBeInTheDocument()
  })

  it('without a card the page looks as before: no tabs', () => {
    accountsData.current = [cash]
    renderAt()
    expect(screen.queryByRole('button', { name: 'Tarjetas' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cuotas' })).toBeNull()
  })

  it('?tab=tarjetas shows the cards panel and ?tab=cuotas the installments, even for deep links', () => {
    accountsData.current = [cash]
    renderAt('/cuentas?tab=tarjetas')
    expect(screen.getByText('panel de tarjetas')).toBeInTheDocument()
  })

  it('switching tabs swaps the content and the header action', async () => {
    accountsData.current = [cash, visa]
    const user = renderAt()
    await user.click(screen.getByRole('button', { name: 'Cuotas' }))
    expect(screen.getByText('panel de cuotas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nueva compra en cuotas' }))
    expect(screen.getByRole('dialog', { name: 'nueva compra en cuotas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tarjetas' }))
    expect(screen.getByText('panel de tarjetas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar tarjeta' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Medios' }))
    expect(screen.queryByText('panel de tarjetas')).toBeNull()
  })
})
