import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { todayIso } from '@/shared/lib/month'
import { totalsOf } from '../domain/transactionQueries'
import { makeTransaction } from '../domain/testing'
import { ActivityPage } from './ActivityPage'

const SALARY = '33333333-3333-4333-8333-333333333333'
const today = todayIso()
const opening = makeTransaction({
  id: 'op',
  kind: 'opening_in',
  categoryId: null,
  note: 'Saldo inicial',
  amountCents: 200_000_00,
  occurredOn: today,
})
const salary = makeTransaction({
  id: 'sal',
  kind: 'income',
  categoryId: SALARY,
  note: null,
  amountCents: 150_000_00,
  occurredOn: today,
})

vi.mock('../api/useTransactions', () => ({
  useTransactions: () => ({ isLoading: false, isError: false, data: [opening, salary] }),
  useTransfers: () => ({ isLoading: false, isError: false, data: [] }),
  useVoidTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/cards/api/useCards', () => ({
  useVoidInstallmentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({
    data: [
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

describe('Activity: starting balance and salary loaded with an account', () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>,
    )
  })

  it('lists the starting balance as «Saldo inicial», adding to the balance', () => {
    expect(screen.getByText('Saldo inicial')).toBeInTheDocument()
    // Only its own row: it is not part of the income totals of the month or of the day.
    expect(screen.getAllByText('+$200.000')).toHaveLength(1)
  })

  it('the starting balance is fixed history: it cannot be edited or voided', () => {
    expect(screen.queryByRole('button', { name: /Anular Saldo inicial/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar Saldo inicial/ })).toBeNull()
  })

  it('a salary loaded with the account is a normal income with its category', () => {
    // Once in its row and again in the totals of the month and of the day: it counts.
    expect(screen.getAllByText('+$150.000').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Anular Sueldo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar Sueldo' })).toBeInTheDocument()
  })

  it('only the salary counts as income of the month', () => {
    expect(totalsOf([opening, salary])).toEqual({ incomeCents: 150_000_00, expenseCents: 0 })
  })
})
