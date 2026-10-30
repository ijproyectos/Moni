import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import { makeTransaction } from '../domain/testing'
import { MovementSheet } from './MovementSheet'

const CASH = '11111111-1111-4111-8111-111111111111'
const BANK = '44444444-4444-4444-8444-444444444444'
const CARD = '55555555-5555-4555-8555-555555555555'
const FOOD = '22222222-2222-4222-8222-222222222222'
const SALARY = '33333333-3333-4333-8333-333333333333'

const createTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const updateTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const createTr = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const accountsData = vi.hoisted(() => ({ current: [] as Account[] }))
// Reserves of the savings goals per account, as the fresh read before saving returns them.
const savingsData = vi.hoisted(() => ({
  current: null as null | {
    accounts: { id: string; name: string; balanceCents: number; reservedCents: number }[]
  },
}))

function account(
  id: string,
  name: string,
  balanceCents: number,
  kind: Account['kind'] = 'cash',
  extra: Partial<Account> = {},
): Account {
  return makeAccount({ id, name, kind, balanceCents, ...extra })
}

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: accountsData.current,
    // The sheet re-reads balances right before saving.
    refetch: () => Promise.resolve({ data: accountsData.current }),
  }),
}))
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
vi.mock('@/features/goals/api/useSavings', () => ({
  useFreshSavings: () => () => Promise.resolve(savingsData.current),
}))
vi.mock('../api/useTransactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: createTx, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: updateTx, isPending: false }),
  useCreateTransfer: () => ({ mutateAsync: createTr, isPending: false }),
}))

function renderSheet(props: Partial<Parameters<typeof MovementSheet>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <MovementSheet initialMode="expense" onClose={onClose} {...props} />
    </MemoryRouter>,
  )
  return { onClose, user: userEvent.setup() }
}

async function fillExpense(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(screen.getByLabelText('Monto'), amount)
  await user.click(screen.getByRole('button', { name: 'Comida' }))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
}

describe('MovementSheet overdraft warning', () => {
  beforeEach(() => {
    createTx.mockClear()
    updateTx.mockClear()
    createTr.mockClear()
    accountsData.current = [account(CASH, 'Efectivo', 10_000_00), account(BANK, 'Banco', 50_000_00)]
    savingsData.current = null
  })

  it('saves straight away when the account covers the expense', async () => {
    const { user, onClose } = renderSheet()
    await fillExpense(user, '4000')
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('warns with balance, amount and negative result, and does not save yet', async () => {
    const { user } = renderSheet()
    await fillExpense(user, '25000')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Saldo actual')
    expect(dialog).toHaveTextContent('$10.000')
    expect(dialog).toHaveTextContent('-$25.000')
    expect(dialog).toHaveTextContent('Saldo resultante')
    expect(dialog).toHaveTextContent('-$15.000')
    expect(createTx).not.toHaveBeenCalled()
  })

  it('cancel keeps the form open and saves nothing', async () => {
    const { user, onClose } = renderSheet()
    await fillExpense(user, '25000')
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText('Monto')).toHaveValue('25000')
    expect(createTx).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('continuing records the expense exactly once', async () => {
    const { user, onClose } = renderSheet()
    await fillExpense(user, '25000')
    await user.dblClick(await screen.findByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(createTx).toHaveBeenCalledTimes(1)
    expect(createTx.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense',
      accountId: CASH,
      amount: 25_000_00,
    })
  })

  it('never warns for incomes', async () => {
    accountsData.current = [account(CASH, 'Efectivo', 0)]
    const { user } = renderSheet({ initialMode: 'income' })
    await user.type(screen.getByLabelText('Monto'), '500')
    await user.click(screen.getByRole('button', { name: 'Sueldo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('counts back the amount of the expense being edited', async () => {
    // Balance 3.000 already includes the 7.000 expense; moving it to 9.000 still fits (10.000 available).
    accountsData.current = [account(CASH, 'Efectivo', 3_000_00)]
    const tx = makeTransaction({
      id: 'e1',
      accountId: CASH,
      categoryId: FOOD,
      amountCents: 7_000_00,
    })
    const { user } = renderSheet({ transaction: tx })
    const amount = screen.getByLabelText('Monto')
    await user.clear(amount)
    await user.type(amount, '9000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(updateTx).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('warns on a transfer larger than the origin balance', async () => {
    const { user } = renderSheet({ initialMode: 'transfer' })
    await user.type(screen.getByLabelText('Monto'), '30000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Esta transferencia')
    expect(dialog).toHaveTextContent('-$20.000')
    expect(createTr).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(createTr).toHaveBeenCalledTimes(1))
  })

  it('never warns about missing balance on a credit card purchase', async () => {
    // A card with no money "in it" and 80.000 of debt can still be used: it only grows the debt.
    accountsData.current = [
      account(CARD, 'Visa', -80_000_00, 'credit_card'),
      account(CASH, 'Efectivo', 1_000_00),
    ]
    const { user, onClose } = renderSheet()
    await user.selectOptions(screen.getByLabelText('Cuenta'), CARD)
    await fillExpense(user, '50000')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(createTx.mock.calls[0]?.[0]).toMatchObject({ accountId: CARD, amount: 50_000_00 })
  })

  it('paying a card preselects it as destination and a non-card account as origin', async () => {
    accountsData.current = [
      account(CARD, 'Visa', -30_000_00, 'credit_card'),
      account(CASH, 'Efectivo', 40_000_00),
    ]
    const { user, onClose } = renderSheet({ initialMode: 'transfer', transferTo: CARD })
    await user.type(screen.getByLabelText('Monto'), '30000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(createTr).toHaveBeenCalledTimes(1)
    expect(createTr.mock.calls[0]?.[0]).toMatchObject({
      fromAccountId: CASH,
      toAccountId: CARD,
      amount: 30_000_00,
    })
    expect(createTx).not.toHaveBeenCalled() // a payment is a transfer, never an expense
  })

  it('still warns when the account that pays the card lacks the money', async () => {
    accountsData.current = [
      account(CARD, 'Visa', -30_000_00, 'credit_card'),
      account(CASH, 'Efectivo', 10_000_00),
    ]
    const { user } = renderSheet({ initialMode: 'transfer', transferTo: CARD })
    await user.type(screen.getByLabelText('Monto'), '30000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('-$20.000')
    expect(createTr).not.toHaveBeenCalled()
  })

  it('warns about the credit limit (not about money) on a card purchase over the limit', async () => {
    accountsData.current = [
      account(CARD, 'Visa', -450_000_00, 'credit_card', { creditLimitCents: 500_000_00 }),
    ]
    const { user, onClose } = renderSheet()
    await fillExpense(user, '100000')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Te pasás del límite')
    expect(dialog).toHaveTextContent('-$50.000')
    expect(dialog).not.toHaveTextContent('Te falta saldo')
    expect(createTx).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(createTx).toHaveBeenCalledTimes(1)
  })

  it('a card purchase inside the limit saves without any warning', async () => {
    accountsData.current = [
      account(CARD, 'Visa', -100_000_00, 'credit_card', { creditLimitCents: 500_000_00 }),
    ]
    const { user, onClose } = renderSheet()
    await fillExpense(user, '100000')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('MovementSheet: spending money reserved for savings goals', () => {
  beforeEach(() => {
    createTx.mockClear()
    createTr.mockClear()
    accountsData.current = [
      account(CASH, 'Efectivo', 10_000_00),
      account(BANK, 'Galicia', 150_000_00),
    ]
    savingsData.current = {
      accounts: [
        { id: BANK, name: 'Galicia', balanceCents: 150_000_00, reservedCents: 30_000_00 },
        { id: CASH, name: 'Efectivo', balanceCents: 10_000_00, reservedCents: 0 },
      ],
    }
  })

  async function pickBank(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(screen.getByLabelText('Cuenta'), 'Galicia')
  }

  it('warns BEFORE saving an expense that leaves the account under its reserved money, with the numbers', async () => {
    const { user } = renderSheet()
    await pickBank(user)
    await fillExpense(user, '130000')
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Ojo con tus ahorros')
    expect(dialog).toHaveTextContent('$30.000 reservados para tus metas en Galicia')
    expect(dialog).toHaveTextContent('el saldo quedaría en $20.000')
    expect(dialog).toHaveTextContent('te faltarían $10.000')
    expect(createTx).not.toHaveBeenCalled()
  })

  it('cancelling saves nothing; continuing records the expense exactly once and never blocks', async () => {
    const { user, onClose } = renderSheet()
    await pickBank(user)
    await fillExpense(user, '130000')
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(createTx).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not warn while the reserves stay covered', async () => {
    const { user } = renderSheet()
    await pickBank(user)
    await fillExpense(user, '120000') // 150.000 - 120.000 = 30.000 = reserved: still covered
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('does not warn on an account with nothing reserved, nor on incomes', async () => {
    const { user } = renderSheet()
    await fillExpense(user, '4000')
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('also warns on a transfer out of the account (card payments are transfers)', async () => {
    // Galicia first: it is the origin account the transfer starts from.
    accountsData.current = [
      account(BANK, 'Galicia', 150_000_00),
      account(CASH, 'Efectivo', 10_000_00),
    ]
    const { user } = renderSheet({ initialMode: 'transfer' })
    await user.type(screen.getByLabelText('Monto'), '140000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Ojo con tus ahorros')
    expect(createTr).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(createTr).toHaveBeenCalledTimes(1))
  })

  it('still saves normally if the reserves cannot be read (the warning is a courtesy, never a blocker)', async () => {
    savingsData.current = null
    const { user } = renderSheet()
    await pickBank(user)
    await fillExpense(user, '140000')
    await waitFor(() => expect(createTx).toHaveBeenCalledTimes(1))
  })
})
