import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import { CardsPanel } from './CardsPanel'

const accountsData = vi.hoisted(() => ({ current: [] as Account[], loading: false }))
const openNew = vi.hoisted(() => vi.fn())

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ isLoading: accountsData.loading, data: accountsData.current }),
}))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew, openEdit: vi.fn() }),
}))
// The summary keeps its own tests; it only needs to be there.
vi.mock('./CardSummarySection', () => ({
  CardSummarySection: ({
    accountId,
    onPay,
  }: {
    accountId: string
    onPay: (c?: number) => void
  }) => (
    <button type="button" onClick={() => onPay(5_000_00)}>
      resumen {accountId}
    </button>
  ),
}))

const visa = makeAccount({
  id: 'visa',
  name: 'Visa',
  kind: 'credit_card',
  balanceCents: -60_000_00,
  creditLimitCents: 500_000_00,
  closingDay: 25,
  dueDay: 5,
})

function renderPanel() {
  const onEdit = vi.fn()
  const onAdd = vi.fn()
  render(<CardsPanel onEdit={onEdit} onAdd={onAdd} />)
  return { user: userEvent.setup(), onEdit, onAdd }
}

describe('CardsPanel (Tarjetas tab of Medios de pago)', () => {
  beforeEach(() => {
    accountsData.current = [makeAccount({ id: 'cash', name: 'Efectivo' }), visa]
    accountsData.loading = false
    openNew.mockClear()
  })

  it('lists each card (never a cash account) with its limit, closing, due date and available credit', () => {
    renderPanel()
    expect(screen.getByText('Visa')).toBeInTheDocument()
    expect(screen.queryByText('Efectivo')).toBeNull()
    expect(screen.getByText(/Cierra el 25 · vence el 5 · límite \$500\.000/)).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText('$440.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'resumen visa' })).toBeInTheDocument()
  })

  it('paying the billed amount opens the transfer to that card', async () => {
    const { user } = renderPanel()
    await user.click(screen.getByRole('button', { name: 'resumen visa' }))
    expect(openNew).toHaveBeenCalledWith('transfer', { toAccountId: 'visa', amountCents: 5_000_00 })
  })

  it('editing a card hands it to the Medios de pago sheet', async () => {
    const { user, onEdit } = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Editar la tarjeta' }))
    expect(onEdit).toHaveBeenCalledWith(visa)
  })

  it('without cards it offers to add one', async () => {
    accountsData.current = [makeAccount({ id: 'cash', name: 'Efectivo' })]
    const { user, onAdd } = renderPanel()
    expect(screen.getByText('Todavía no tenés tarjetas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar una tarjeta' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('shows a loading state while accounts load', () => {
    accountsData.loading = true
    accountsData.current = []
    renderPanel()
    expect(screen.getByRole('status', { name: 'Cargando tarjetas' })).toBeInTheDocument()
  })
})
