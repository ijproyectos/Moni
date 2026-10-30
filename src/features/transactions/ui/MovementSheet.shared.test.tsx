import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { GroupMember } from '@/features/groups/domain/group'
import { MovementSheet } from './MovementSheet'

const ME = '00000000-0000-4000-8000-00000000000a'
const BETO = '00000000-0000-4000-8000-00000000000b'
const FOOD = '22222222-2222-4222-8222-222222222222'
const GROUP = '99999999-9999-4999-8999-999999999999'

const createTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const createShared = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const groupsData = vi.hoisted(() => ({ current: [] as { id: string; name: string }[] }))

const member = (userId: string, displayName: string): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-10-01T00:00:00Z',
  leftAt: null,
})

vi.mock('@/features/accounts/api/useAccounts', async () => {
  const { makeAccount } = await import('@/features/accounts/domain/testing')
  const data = [
    makeAccount({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Efectivo',
      kind: 'cash',
      balanceCents: 100_000_00,
    }),
  ]
  return {
    useAccounts: () => ({
      isLoading: false,
      isError: false,
      data,
      refetch: () => Promise.resolve({ data }),
    }),
  }
})
vi.mock('@/features/categories/api/useCategories', () => ({
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
}))
vi.mock('@/features/goals/api/useSavings', () => ({
  useFreshSavings: () => () => Promise.resolve(null),
}))
vi.mock('@/features/auth/api/authContext', () => ({
  useAuth: () => ({ user: { id: ME } }),
}))
vi.mock('../api/useTransactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: createTx, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/groups/api/useGroups', () => ({
  useMyGroups: () => ({ isLoading: false, isError: false, data: groupsData.current }),
  useGroup: () => ({ data: { id: GROUP, kind: 'amigos' } }),
  useGroupMembers: () => ({
    isLoading: false,
    isError: false,
    data: [member(ME, 'Ana'), member(BETO, 'Beto')],
  }),
  useCreateSharedExpense: () => ({ mutateAsync: createShared, isPending: false }),
}))

function setup() {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <MovementSheet initialMode="expense" onClose={onClose} />
    </MemoryRouter>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('MovementSheet shared switch', () => {
  beforeEach(() => {
    createTx.mockClear()
    createShared.mockClear()
    groupsData.current = [{ id: GROUP, name: 'Depto' }]
  })

  it('with the switch off saves a plain expense as before', async () => {
    const { user, onClose } = setup()
    expect(screen.getByRole('switch', { name: 'Compartido' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.queryByLabelText('Grupo')).toBeNull()
    await user.type(screen.getByLabelText('Monto'), '4000')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Comida')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
    expect(createShared).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('is not offered for incomes', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Ingreso' }))
    expect(screen.queryByRole('switch', { name: 'Compartido' })).toBeNull()
  })

  it('on + group selected saves through the shared path with what was typed', async () => {
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('Monto'), '4000')
    await user.type(screen.getByLabelText('Nota'), 'Cena')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Comida')
    await user.click(screen.getByRole('switch', { name: 'Compartido' }))
    await user.selectOptions(screen.getByLabelText('Grupo'), GROUP)
    expect(screen.getByLabelText('Monto')).toHaveValue('4000')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Cena')
    await user.click(screen.getByRole('button', { name: 'Guardar gasto compartido' }))
    await waitFor(() => expect(createShared).toHaveBeenCalledTimes(1))
    const call = createShared.mock.calls[0]?.[0]
    expect(call.groupId).toBe(GROUP)
    expect(call.values).toMatchObject({
      amount: 4_000_00,
      description: 'Cena',
      templateSlug: 'comida',
      paidBy: ME,
      splitMethod: 'equal',
      participants: [ME, BETO],
    })
    expect(createTx).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('switching back off restores the plain form with the typed values', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Monto'), '1500')
    await user.click(screen.getByRole('switch', { name: 'Compartido' }))
    await user.click(screen.getByRole('switch', { name: 'Compartido' }))
    expect(screen.getByLabelText('Monto')).toHaveValue('1500')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })

  it('shows an empty state with a link to create a group when there are none', async () => {
    groupsData.current = []
    const { user } = setup()
    await user.click(screen.getByRole('switch', { name: 'Compartido' }))
    expect(screen.getByText(/Todavía no tenés grupos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear grupo' })).toHaveAttribute(
      'href',
      '/grupos/nuevo',
    )
  })
})
