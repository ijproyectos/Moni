import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { AuthContext } from '@/features/auth/api/authContext'
import { ActivityPage } from './ActivityPage'
import { MovementSheet } from './MovementSheet'

// End to end through the real hooks and repository, with an in-memory stand-in for Supabase:
// what the person saves in the sheet has to be what Actividad lists afterwards.

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CASH = '11111111-1111-4111-8111-111111111111'
const CARD = '55555555-5555-4555-8555-555555555555'
const FOOD = '22222222-2222-4222-8222-222222222222'
const SALARY = '33333333-3333-4333-8333-333333333333'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ transactions: [] as Row[], transfers: [] as Row[] }))

vi.mock('@/shared/lib/supabase', () => {
  function table(name: 'transactions' | 'transfers') {
    const filters: ((r: Row) => boolean)[] = []
    const builder = {
      insert(row: Row) {
        db[name].push({
          id: `row-${db[name].length + 1}`,
          status: 'posted',
          voided_at: null,
          shared_expense_id: null,
          created_at: new Date().toISOString(),
          note: null,
          ...row,
        })
        return Promise.resolve({ error: null })
      },
      select: () => builder,
      order: () => builder,
      eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), builder),
      gte: (col: string, value: string) => (filters.push((r) => String(r[col]) >= value), builder),
      lte: (col: string, value: string) => (filters.push((r) => String(r[col]) <= value), builder),
      in: (col: string, values: unknown[]) => (
        filters.push((r) => values.includes(r[col])),
        builder
      ),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: db[name].filter((r) => filters.every((f) => f(r))), error: null }),
    }
    return builder
  }
  return { getSupabase: () => ({ from: (name: 'transactions' | 'transfers') => table(name) }) }
})

const accountsData = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    isLoading: false,
    isError: false,
    data: accountsData.current,
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
vi.mock('@/features/cards/api/useCards', () => ({
  useVoidInstallmentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{ session: null, user: { id: USER } as never, isLoading: false }}
      >
        <MemoryRouter>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

function account(id: string, name: string, kind: 'cash' | 'credit_card') {
  return {
    id,
    name,
    kind,
    currency: 'ARS',
    openingBalanceCents: 0,
    balanceCents: 0,
    archivedAt: null,
    creditLimitCents: null,
    closingDay: null,
    dueDay: null,
  }
}

async function saveIncome(
  accountName: string,
  amount: string,
  note: string,
  from: 'income' | 'expense' = 'income',
) {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const { unmount } = render(<MovementSheet initialMode={from} onClose={onClose} />, { wrapper })
  // The "+" button always opens on Gasto: the person switches to Ingreso afterwards.
  if (from === 'expense') await user.click(screen.getByRole('button', { name: 'Ingreso' }))
  await user.selectOptions(screen.getByLabelText('Cuenta'), accountName)
  await user.type(screen.getByLabelText('Monto'), amount)
  await user.type(screen.getByLabelText('Nota'), note)
  await user.click(screen.getByRole('button', { name: 'Sueldo' }))
  await user.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  unmount()
}

describe('an income saved in the sheet shows up in Actividad', () => {
  beforeEach(() => {
    db.transactions.length = 0
    db.transfers.length = 0
    accountsData.current = [account(CASH, 'Efectivo', 'cash'), account(CARD, 'Visa', 'credit_card')]
  })

  it.each([
    ['Efectivo', CASH],
    ['Visa · Tarjeta', CARD],
  ])('income into %s is stored as a posted income and listed', async (accountName, accountId) => {
    await saveIncome(accountName, '970000', 'Sueldo octubre', 'expense')

    expect(db.transactions).toHaveLength(1)
    expect(db.transactions[0]).toMatchObject({
      kind: 'income',
      account_id: accountId,
      category_id: SALARY,
      amount: 970000,
      status: 'posted',
    })

    render(<ActivityPage />, { wrapper })
    const row = await screen.findByText('Sueldo octubre')
    expect(within(row.closest('li') ?? document.body).getByText(/970\.000/)).toBeInTheDocument()
  })
})
