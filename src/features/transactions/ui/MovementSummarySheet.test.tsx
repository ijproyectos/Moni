import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Transaction } from '../domain/transaction'
import { MovementSummarySheet } from './MovementSummarySheet'

vi.mock('@/features/groups/api/useGroupLedger', () => ({
  useGroupLedger: () => ({
    ledger: {
      people: [
        { id: 'me', name: 'Vos' },
        { id: 'beto', name: 'Beto' },
      ],
      expenses: [
        {
          id: 'se1',
          payers: [{ personId: 'me', cents: 300_000 }],
          shares: [
            { personId: 'me', cents: 150_000 },
            { personId: 'beto', cents: 150_000 },
          ],
          methodLabel: 'entre 2',
        },
      ],
    },
  }),
}))

const tx = (over: Partial<Transaction> = {}): Transaction =>
  ({
    id: 't1', kind: 'expense', amountCents: 15_000_00, occurredOn: '2026-11-20', note: 'Coto', accountId: 'a', categoryId: 'c',
    installmentPlanId: null, installmentNumber: null, installmentsTotal: null, sharedExpenseId: null, groupId: null, createdAt: '2026-11-20T10:00:00Z', ...over,
  }) as Transaction

function setup(t: Transaction, over: { groupName?: string | null } = {}) {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <MemoryRouter>
      <MovementSummarySheet
        transaction={t}
        category={{ id: 'c', name: 'Súper', icon: 'ShoppingCart', color: '#000' } as never}
        accountName="Banco"
        groupName={over.groupName ?? null}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </MemoryRouter>,
  )
  return { onEdit, onDelete, user: userEvent.setup() }
}

describe('MovementSummarySheet', () => {
  it('shows what the movement is with only real data, and Editar / Eliminar', async () => {
    const { onEdit, onDelete, user } = setup(tx())
    const dialog = screen.getByRole('dialog', { name: 'Resumen del movimiento' })
    expect(within(dialog).getByText('Coto')).toBeInTheDocument()
    expect(within(dialog).getByText('Gasto')).toBeInTheDocument()
    expect(within(dialog).getByText('Banco')).toBeInTheDocument()
    expect(within(dialog).getByText('Súper')).toBeInTheDocument()
    expect(within(dialog).queryByText('Grupo')).toBeNull()
    expect(within(dialog).queryByText('Nota')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('a group expense shows the group, who took part and what each one owes; it is managed from the group', () => {
    setup(tx({ kind: 'shared_payment', groupId: 'g1', sharedExpenseId: 'se1', note: 'Asado' }), { groupName: 'IJ Society' })
    expect(screen.getByText('IJ Society')).toBeInTheDocument()
    const split = screen.getByRole('region', { name: 'División del gasto' })
    expect(within(split).getByText(/Pagó Vos · entre 2/)).toBeInTheDocument()
    expect(within(split).getByText('Beto')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver en el grupo' })).toHaveAttribute('href', '/grupos/g1')
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
  })

  it('names the type of a movement that is not income or expense', () => {
    setup(tx({ kind: 'adjustment_out', note: null }))
    expect(screen.getAllByText('Ajuste de saldo').length).toBeGreaterThan(0)
  })
})
