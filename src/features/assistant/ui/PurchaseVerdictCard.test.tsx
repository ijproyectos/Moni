import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PurchaseVerdictCard } from './PurchaseVerdictCard'

const openNew = vi.hoisted(() => vi.fn())
const allowanceState = vi.hoisted(() => ({
  value: {
    isLoading: false,
    allowance: {
      kind: 'ok',
      dailyCents: 24_300_00,
      remainingCents: 486_000_00,
      daysLeft: 20,
      expectedIncomeCents: 1_000_000_00,
    },
  } as { isLoading: boolean; allowance: Record<string, unknown> },
}))

vi.mock('@/features/dashboard/api/useDailyAllowance', () => ({
  useDailyAllowance: () => allowanceState.value,
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))
vi.mock('@/features/cards/api/useCards', () => ({
  useCardOverview: () => ({ data: undefined }),
}))
vi.mock('@/features/cards/api/useStatementBars', () => ({
  useStatementBars: () => ({ bars: [] }),
}))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew }),
}))

describe('PurchaseVerdictCard', () => {
  it('shows the verdict with the day before and after the first installment', () => {
    render(<PurchaseVerdictCard request={{ amountCents: 180_000_00, installments: 3 }} message="x" />)
    expect(screen.getByText(/Cada cuota es de/)).toHaveTextContent('$60.000')
    expect(screen.getByRole('region', { name: 'Veredicto' })).toHaveTextContent('Conviene')
    expect(screen.getByText('$24.300')).toBeInTheDocument()
    expect(screen.getByText('$21.300')).toBeInTheDocument()
  })

  it('says "No conviene" when the first payment is more than what is left', () => {
    render(<PurchaseVerdictCard request={{ amountCents: 900_000_00, installments: 1 }} message="x" />)
    expect(screen.getByRole('region', { name: 'Veredicto' })).toHaveTextContent('No conviene')
  })

  it('has no "Avisame" button; "La compro igual" opens the manual load with the amount', async () => {
    render(<PurchaseVerdictCard request={{ amountCents: 50_000_00, installments: 1 }} message="x" />)
    expect(screen.queryByText(/Avisame/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'La compro igual' }))
    expect(openNew).toHaveBeenCalledWith('expense', { amountCents: 50_000_00 })
  })

  it('shows nothing without income data', () => {
    allowanceState.value = { isLoading: false, allowance: { kind: 'sin-datos' } }
    const { container } = render(
      <PurchaseVerdictCard request={{ amountCents: 50_000_00, installments: 1 }} message="x" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
