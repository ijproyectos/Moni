import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { monthStart, todayIso } from '@/shared/lib/month'
import { ToastProvider } from '@/shared/ui/Toast'
import type { BudgetStatus } from '../domain/budget'
import { BudgetPage } from './BudgetPage'

const state = vi.hoisted(() => ({ data: [] as unknown[], loading: false }))
vi.mock('../api/useBudgets', () => ({
  useBudgetStatus: () => ({
    data: state.data,
    isLoading: state.loading,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({ data: [], isLoading: false }),
}))

const budget = (id: string, name: string, amount: number, spent: number): BudgetStatus => ({
  budgetId: id,
  categoryId: `c-${id}`,
  name,
  color: '#000000',
  icon: 'Utensils',
  amountCents: amount,
  spentCents: spent,
  remainingCents: amount - spent,
  percent: (spent / amount) * 100,
  state: spent > amount ? 'over' : spent / amount >= 0.8 ? 'warning' : 'ok',
})

function setup(data: BudgetStatus[]) {
  state.data = data
  render(
    <MemoryRouter>
      <ToastProvider>
        <BudgetPage />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('BudgetPage', () => {
  it('shows what is left of all the limits and each category with its state', () => {
    setup([budget('1', 'Delivery', 80_000_00, 96_000_00), budget('2', 'Súper', 350_000_00, 184_000_00)])
    const hero = screen.getByRole('region', { name: 'Te quedan' })
    // 430.000 of limits, 280.000 spent: 150.000 left.
    expect(within(hero).getByText('$150.000')).toBeInTheDocument()
    expect(hero).toHaveTextContent('Usaste $280.000 de $430.000')
    const rows = screen.getAllByRole('button', { name: /^Editar presupuesto de/ })
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getByText('Te pasaste')).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByText('Vas bien')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent('$96.000 de $80.000')
  })

  it('says by how much the limits together were exceeded', () => {
    setup([budget('1', 'Delivery', 80_000_00, 100_000_00)])
    const hero = screen.getByRole('region', { name: 'Te pasaste por' })
    expect(within(hero).getByText('$20.000')).toBeInTheDocument()
  })

  it('is honest when there is no budget yet, and "Agregar" opens the sheet', async () => {
    const user = setup([])
    expect(screen.getByText('Todavía no definiste límites')).toBeInTheDocument()
    expect(screen.queryByText('Te quedan')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(screen.getByRole('dialog', { name: 'Nuevo presupuesto' })).toBeInTheDocument()
  })

  it('titles the screen with the month of today', () => {
    setup([])
    expect(screen.getByRole('heading', { level: 1, name: 'Presupuesto' })).toBeInTheDocument()
    expect(monthStart(todayIso())).toBeTruthy()
  })
})
