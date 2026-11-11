import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { CategoriesPage } from './CategoriesPage'

const state = vi.hoisted(() => ({ txs: [] as unknown[] }))
const cat = (id: string, name: string) => ({
  id,
  name,
  kind: 'expense',
  icon: 'ShoppingCart',
  color: '#2f9e8f',
  archivedAt: null,
})
vi.mock('../api/useCategories', () => ({
  useCategories: () => ({ isLoading: false, isError: false, data: [cat('a', 'Súper'), cat('b', 'Café')] }),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/dashboard/api/useMonthSummary', () => ({
  useMonthSummary: () => ({
    data: { byCategory: [{ categoryId: 'a', amountCents: 184_000_00 }] },
  }),
}))
vi.mock('@/features/budgets/api/useBudgets', () => ({
  useBudgetStatus: () => ({ data: [] }),
  useCreateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/budgets/ui/BudgetSuggestions', () => ({ BudgetSuggestions: () => null }))
vi.mock('@/features/transactions/api/useTransactions', () => ({
  useTransactions: () => ({ data: state.txs }),
}))

function setup() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <CategoriesPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00-03:00'))
    state.txs = []
  })
  afterEach(() => vi.useRealTimers())

  it('shows a grid with each category, its month amount and a dashed "Nueva" card', () => {
    setup()
    expect(screen.getByText('2 categorías · noviembre')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar Súper' })).toHaveTextContent('$184.000')
    expect(screen.getByRole('button', { name: 'Editar Café' })).toHaveTextContent('Sin gastos')
    expect(screen.getByRole('button', { name: 'Nueva' })).toBeInTheDocument()
  })

  it('offers to sort uncategorized movements only when there are some', () => {
    setup()
    expect(screen.queryByText(/sin categoría/)).toBeNull()
  })

  it('counts the real uncategorized movements of the month', () => {
    state.txs = [
      { kind: 'expense', status: 'posted', categoryId: null, occurredOn: '2026-11-03' },
      { kind: 'income', status: 'posted', categoryId: null, occurredOn: '2026-11-04' },
      { kind: 'expense', status: 'posted', categoryId: 'a', occurredOn: '2026-11-05' },
    ]
    setup()
    expect(screen.getByRole('link', { name: /Tengo 2 movimientos sin categoría. ¿Los ordenamos\?/ })).toHaveAttribute('href', '/actividad')
  })
})
