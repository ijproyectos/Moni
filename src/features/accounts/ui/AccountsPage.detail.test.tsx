import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { AccountsPage } from './AccountsPage'

const archive = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const openNew = vi.hoisted(() => vi.fn())
const accounts = vi.hoisted(() => ({ current: [] as ReturnType<typeof makeAccount>[] }))

vi.mock('../api/useAccounts', () => ({
  useAccounts: () => ({ isLoading: false, isError: false, data: accounts.current }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: archive, isPending: false }),
  useAdjustAccountBalance: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClassifyOpeningBalance: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransferData: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/goals/api/useSavings', () => ({
  useSavings: () => ({
    data: { accounts: [{ id: 'galicia', reservedCents: 50_000_00, freeCents: 100_000_00 }] },
  }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/mpImport/ui/MpImportSection', () => ({ MpImportSection: () => null }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew, openEdit: vi.fn() }),
}))

function renderPage() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AccountsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  archive.mockClear()
  openNew.mockClear()
  accounts.current = [
    makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash', balanceCents: 20_000_00 }),
    makeAccount({ id: 'galicia', name: 'Galicia', kind: 'bank', balanceCents: 150_000_00 }),
  ]
})

describe('Medios de pago: opening a card', () => {
  it('tapping a card opens its detail (not a generic form) and going back returns to the list', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Abrir Galicia' }))
    const detail = screen.getByRole('dialog', { name: 'Galicia' })
    expect(detail).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Tipo de cuenta' })).toBeNull()
    expect(screen.getByTestId('account-hero')).toHaveTextContent('$150.000')
    // It carries what the savings goals reserve in that account.
    expect(screen.getByTestId('account-hero')).toHaveTextContent('Reservado para metas $50.000')
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog', { name: 'Galicia' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Medios de pago' })).toBeVisible()
  })

  it('deleting asks for confirmation first; nothing is deleted until confirmed', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Abrir Galicia' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar medio de pago' }))
    expect(screen.getByText('¿Eliminar este medio?')).toBeVisible()
    expect(archive).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(archive).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Galicia' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Eliminar medio de pago' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(archive).toHaveBeenCalledWith({ id: 'galicia' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Galicia' })).toBeNull())
  })

  it('the only medium left cannot be deleted', async () => {
    accounts.current = [makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash' })]
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Abrir Efectivo' }))
    expect(screen.queryByRole('button', { name: 'Eliminar medio de pago' })).toBeNull()
  })

  it('"Transferir entre medios" and "Nuevo medio de pago" keep working', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Transferir entre medios' }))
    expect(openNew).toHaveBeenCalledWith('transfer')
    await user.click(screen.getByRole('button', { name: 'Nuevo medio de pago' }))
    // Creating still uses the form, with the type selector (it is a new medium).
    expect(screen.getByRole('group', { name: 'Tipo de cuenta' })).toBeVisible()
  })

  it('paying a card from its detail opens the transfer to that card', async () => {
    accounts.current = [
      makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash', balanceCents: 90_000_00 }),
      makeAccount({ id: 'visa', name: 'Visa', kind: 'credit_card', balanceCents: -30_000_00 }),
    ]
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Abrir Visa' }))
    await user.click(screen.getByRole('button', { name: 'Pagar tarjeta' }))
    expect(openNew).toHaveBeenCalledWith('transfer', { toAccountId: 'visa' })
    expect(screen.queryByRole('dialog', { name: 'Visa' })).toBeNull()
  })
})
