import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeAccount } from '@/features/accounts/domain/testing'
import { makeTransaction } from '@/features/transactions/domain/testing'
import { ToastProvider } from '@/shared/ui/Toast'
import type { GroupMember } from '../domain/group'
import type { LedgerExpense } from '../domain/ledger'
import { SharedExpenseSheet } from './SharedExpenseSheet'

const ME = '00000000-0000-4000-8000-00000000000a'
const BETO = '00000000-0000-4000-8000-00000000000b'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const FOOD = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  txs: [] as unknown[],
  createShared: vi.fn(),
  createGuest: vi.fn(),
  convert: vi.fn(),
}))

const member = (userId: string, displayName: string): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-10-01T00:00:00Z',
  leftAt: null,
})

vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: ME } }) }))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: [makeAccount({ id: ACCOUNT, name: 'Galicia', kind: 'bank' })],
  }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategoryTemplates: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        slug: 'comida',
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        sortOrder: 1,
      },
    ],
  }),
  useCategories: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: FOOD,
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        archivedAt: null,
      },
    ],
  }),
}))
vi.mock('@/features/transactions/api/useTransactions', () => ({
  useTransactions: () => ({ isLoading: false, data: state.txs }),
}))
vi.mock('../api/useGroups', () => ({
  useGroup: () => ({ data: { id: 'g1', kind: 'amigos' } }),
  useGroupMembers: () => ({
    isLoading: false,
    isError: false,
    data: [member(ME, 'Ana'), member(BETO, 'Beto')],
  }),
  useCreateSharedExpense: () => ({ mutateAsync: state.createShared, isPending: false }),
  useConvertSharedToExpense: () => ({ mutateAsync: state.convert, isPending: false }),
}))
vi.mock('../api/useGroupGuests', () => ({
  useGroupOverlay: () => ({ guests: [], coupleSplit: 'half', incomeShare: 0.5 }),
  useCreateGuestExpense: () => ({ mutateAsync: state.createGuest, isPending: false }),
}))

const real = (over: Partial<LedgerExpense> = {}): LedgerExpense => ({
  id: 'e1',
  source: 'real',
  description: 'Cena',
  amountCents: 20_000_00,
  payers: [{ personId: ME, cents: 20_000_00 }],
  shares: [
    { personId: ME, cents: 10_000_00 },
    { personId: BETO, cents: 10_000_00 },
  ],
  occurredOn: '2026-10-20',
  templateSlug: 'comida',
  methodLabel: 'entre 2',
  createdBy: ME,
  ...over,
})

function setup(editing?: LedgerExpense) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <SharedExpenseSheet groupId="g1" editing={editing} onClose={onClose} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

beforeEach(() => {
  state.txs = []
  state.createShared.mockReset().mockResolvedValue('new')
  state.createGuest.mockReset().mockResolvedValue('new')
  state.convert.mockReset().mockResolvedValue('tx')
})

describe('Editar un gasto compartido', () => {
  it('saves the edit as ONE replacement of the old expense (no separate void that could leave it missing)', async () => {
    const { user, onClose } = setup(real())
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(state.createShared).toHaveBeenCalledTimes(1))
    const call = state.createShared.mock.calls[0]?.[0]
    expect(call.replaces).toEqual({ kind: 'shared', id: 'e1' })
    expect(call.values).toMatchObject({ amount: 20_000_00, description: 'Cena', paidBy: ME })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps charging the account it was paid from: the account is preselected from its payment movement', async () => {
    state.txs = [
      makeTransaction({
        id: 'p1',
        kind: 'shared_payment',
        accountId: ACCOUNT,
        sharedExpenseId: 'e1',
      }),
    ]
    const { user } = setup(real())
    await user.click(screen.getByRole('button', { name: /Fecha, categoría y cuenta/ }))
    expect(screen.getByRole('combobox', { name: /Pagado desde/ })).toHaveValue(ACCOUNT)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(state.createShared).toHaveBeenCalled())
    expect(state.createShared.mock.calls[0]?.[0].values.payerAccountId).toBe(ACCOUNT)
  })

  it('an expense with people without an account is replaced through the guest path', async () => {
    const guest = real({
      id: 'g9',
      source: 'sim',
      shares: [
        { personId: ME, cents: 10_000_00 },
        { personId: 'guest-fran', cents: 10_000_00 },
      ],
    })
    state.txs = [
      makeTransaction({
        id: 'p2',
        kind: 'shared_payment',
        accountId: ACCOUNT,
        guestExpenseId: 'g9',
      }),
    ]
    const { user } = setup(guest)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(state.createGuest).toHaveBeenCalledTimes(1))
    const call = state.createGuest.mock.calls[0]?.[0]
    expect(call.replaces).toEqual({ kind: 'guest', id: 'g9' })
    expect(call.expense.payerAccountId).toBe(ACCOUNT)
  })

  it('the server refusing because of payments is explained and nothing closes', async () => {
    state.createShared.mockRejectedValue(new Error('expense_has_payments'))
    const { user, onClose } = setup(real())
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/pagos registrados/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a new expense is saved without any replacement', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Monto'), '1000')
    await user.type(screen.getByLabelText('Descripción'), 'Pan')
    await user.click(screen.getByRole('button', { name: 'Guardar en el grupo' }))
    await waitFor(() => expect(state.createShared).toHaveBeenCalled())
    expect(state.createShared.mock.calls[0]?.[0].replaces).toBeUndefined()
  })
})

describe('Pasar a gasto individual', () => {
  it('is offered only to the person who paid', () => {
    setup(real())
    expect(screen.getByRole('button', { name: 'Pasar a gasto individual' })).toBeInTheDocument()
  })

  it('is not offered when somebody else paid', () => {
    const { onClose } = setup(real({ payers: [{ personId: BETO, cents: 20_000_00 }] }))
    void onClose
    expect(screen.queryByRole('button', { name: 'Pasar a gasto individual' })).toBeNull()
  })

  it('converts with the account it was paid from and the matching category, in one call', async () => {
    state.txs = [
      makeTransaction({
        id: 'p1',
        kind: 'shared_payment',
        accountId: ACCOUNT,
        sharedExpenseId: 'e1',
      }),
    ]
    const { user, onClose } = setup(real())
    await user.click(screen.getByRole('button', { name: 'Pasar a gasto individual' }))
    expect(screen.getByText(/queda como gasto tuyo por el total, \$20\.000/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Cuenta' })).toHaveValue(ACCOUNT)
    expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveValue(FOOD)
    await user.click(screen.getByRole('button', { name: 'Pasar a individual' }))
    await waitFor(() => expect(state.convert).toHaveBeenCalledTimes(1))
    expect(state.convert).toHaveBeenCalledWith({
      kind: 'shared',
      id: 'e1',
      accountId: ACCOUNT,
      categoryId: FOOD,
      note: 'Cena',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('an expense with people without an account converts as "guest"', async () => {
    const { user } = setup(real({ id: 'g9', source: 'sim' }))
    await user.click(screen.getByRole('button', { name: 'Pasar a gasto individual' }))
    await user.click(screen.getByRole('button', { name: 'Pasar a individual' }))
    await waitFor(() => expect(state.convert).toHaveBeenCalled())
    expect(state.convert.mock.calls[0]?.[0]).toMatchObject({ kind: 'guest', id: 'g9' })
  })

  it('shows why when the server refuses (payments recorded) and does not close', async () => {
    state.convert.mockRejectedValue(new Error('expense_has_payments'))
    const { user, onClose } = setup(real())
    await user.click(screen.getByRole('button', { name: 'Pasar a gasto individual' }))
    await user.click(screen.getByRole('button', { name: 'Pasar a individual' }))
    expect(await screen.findByText(/pagos registrados/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('going back returns to the expense without converting anything', async () => {
    const { user } = setup(real())
    await user.click(screen.getByRole('button', { name: 'Pasar a gasto individual' }))
    await user.click(screen.getByRole('button', { name: /Cerrar|Volver/ }))
    expect(state.convert).not.toHaveBeenCalled()
  })
})
