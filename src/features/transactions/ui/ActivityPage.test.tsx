import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { todayIso } from '@/shared/lib/month'
import { makeTransaction } from '../domain/testing'
import { ActivityPage } from './ActivityPage'

const FOOD = '22222222-2222-4222-8222-222222222222'
const SALARY = '33333333-3333-4333-8333-333333333333'
const voidTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const today = todayIso()

vi.mock('../api/useTransactions', () => ({
  useTransactions: () => ({
    isLoading: false,
    isError: false,
    data: [
      makeTransaction({
        id: 'e1',
        note: 'Cena',
        categoryId: FOOD,
        amountCents: 2_200_000,
        occurredOn: today,
      }),
      makeTransaction({
        id: 'i1',
        kind: 'income',
        note: 'Sueldo octubre',
        categoryId: SALARY,
        amountCents: 9_700_000,
        occurredOn: today,
      }),
    ],
  }),
  useTransfers: () => ({ isLoading: false, isError: false, data: [] }),
  useVoidTransaction: () => ({ mutateAsync: voidTx, isPending: false }),
  useVoidTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({
    data: [
      {
        id: FOOD,
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        archivedAt: null,
      },
      {
        id: SALARY,
        kind: 'income',
        name: 'Sueldo',
        icon: 'Wallet',
        color: '#0E8A6D',
        archivedAt: null,
      },
    ],
  }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))

function setup() {
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('ActivityPage', () => {
  beforeEach(() => voidTx.mockClear())

  it('lists the month and filters by search text', async () => {
    const user = setup()
    expect(screen.getByText('2 movimientos')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Buscar por nota o categoría'), 'cena')
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()
    expect(screen.queryByText('Sueldo octubre')).not.toBeInTheDocument()
  })

  it('filters by kind with the segmented control', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Ingresos' }))
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()
    expect(screen.getByText('Sueldo octubre')).toBeInTheDocument()
    expect(screen.queryByText('Cena')).not.toBeInTheDocument()
  })

  it('asks for confirmation before voiding a movement', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Anular Cena' }))
    const dialog = screen.getByRole('dialog', { name: '¿Anular este movimiento?' })
    expect(voidTx).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Anular' }))
    expect(voidTx).toHaveBeenCalledWith('e1')
  })

  it('cancelling the confirmation keeps the movement', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Anular Cena' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(voidTx).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
