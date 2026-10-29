import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { todayIso } from '@/shared/lib/month'
import { makeTransaction } from '../domain/testing'
import { ActivityPage } from './ActivityPage'

const today = todayIso()
const voidPlan = vi.hoisted(() => vi.fn().mockResolvedValue(3))
const future = '2999-12-25'

vi.mock('../api/useTransactions', () => ({
  useTransactions: () => ({
    isLoading: false,
    isError: false,
    data: [
      makeTransaction({
        id: 'adj',
        kind: 'adjustment_in',
        categoryId: null,
        note: 'Ajuste de saldo',
        amountCents: 14_000_00,
        occurredOn: today,
      }),
      makeTransaction({
        id: 'set',
        kind: 'settlement_in',
        categoryId: null,
        note: 'Te pagaron',
        amountCents: 2_000_00,
        occurredOn: today,
      }),
      makeTransaction({ id: 'exp', note: 'Cena', amountCents: 2_200_00, occurredOn: today }),
      makeTransaction({
        id: 'c1',
        note: 'Heladera',
        amountCents: 70_000_00,
        occurredOn: today,
        installmentPlanId: 'plan-1',
        installmentNumber: 1,
        installmentsTotal: 12,
      }),
      makeTransaction({
        id: 'c2',
        note: 'Heladera',
        amountCents: 70_000_00,
        occurredOn: future,
        installmentPlanId: 'plan-1',
        installmentNumber: 2,
        installmentsTotal: 12,
      }),
    ],
  }),
  useTransfers: () => ({ isLoading: false, isError: false, data: [] }),
  useVoidTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/cards/api/useCards', () => ({
  useVoidInstallmentPlan: () => ({ mutateAsync: voidPlan, isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))

describe('Activity: adjustments and incoming settlements', () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>,
    )
  })

  it('shows an adjustment as an increase that can be voided but not edited', () => {
    expect(screen.getByText('+$14.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anular Ajuste de saldo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar Ajuste de saldo' })).toBeNull()
  })

  it('shows money received from a group settlement as income, not as a spend', () => {
    expect(screen.getByText('+$2.000')).toBeInTheDocument()
    expect(screen.queryByText('-$2.000')).toBeNull()
  })

  it('keeps expenses editable', () => {
    expect(screen.getByRole('button', { name: 'Editar Cena' })).toBeInTheDocument()
  })

  it('shows a future installment as scheduled, not as an executed expense', () => {
    expect(screen.getByText('Heladera · cuota 2/12')).toBeInTheDocument()
    expect(screen.getByText(/^Programada · cierra el/)).toBeInTheDocument()
    // The day it falls on has only scheduled installments: it is labeled, not summed as spending.
    expect(screen.getByText('Programado -$70.000')).toBeInTheDocument()
  })

  it('an installment already charged is a normal expense of its day', () => {
    expect(screen.getByText('Heladera · cuota 1/12')).toBeInTheDocument()
  })

  it('installments are not editable and voiding one cancels the whole purchase', async () => {
    expect(screen.queryByRole('button', { name: 'Editar Heladera' })).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: 'Anular Heladera' })[1] as HTMLElement)
    expect(screen.getByRole('dialog', { name: '¿Anular la compra en cuotas?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    expect(voidPlan).toHaveBeenCalledWith('plan-1')
  })
})
