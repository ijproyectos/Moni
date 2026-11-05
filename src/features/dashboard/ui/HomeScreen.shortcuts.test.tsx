import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

const ants = vi.hoisted(() => ({ data: undefined as { monthTotalCents: number } | undefined }))
vi.mock('@/features/budgets/api/useBudgets', () => ({ useBudgetStatus: () => ({ data: [] }) }))
vi.mock('@/features/insights/api/useAnts', () => ({ useAnts: () => ({ data: ants.data }) }))

const summary: MonthSummary = {
  incomeCents: 100_000_00,
  expenseCents: 20_000_00,
  balanceCents: 80_000_00,
  availableBalanceCents: 568_000_00,
  byCategory: [],
  daily: [],
  recent: [
    {
      id: 'm1',
      kind: 'expense',
      amountCents: 5_000_00,
      note: 'Café de prueba',
      occurredOn: '2026-10-10',
      categoryName: 'Comida',
      categoryIcon: 'Utensils',
      categoryColor: '#E5533D',
      accountName: 'Efectivo',
    } as MonthSummary['recent'][number],
  ],
}

function renderHome(props: { antsOn?: boolean } = {}) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        month="2026-10-01"
        latestMonth="2026-10-01"
        onMonthChange={vi.fn()}
        initial="J"
        onAddMovement={vi.fn()}
        shortcuts={{ ants: props.antsOn ?? true }}
      />
    </MemoryRouter>,
  )
}

const hormigas = () => screen.queryByRole('link', { name: /Hormigas/ })

beforeEach(() => {
  ants.data = undefined
})

describe('Home: Hormigas only when there is something real to show', () => {
  it('is not there by default, and "Movimientos" lists the newest', () => {
    renderHome()
    expect(hormigas()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Movimientos' })).toBeInTheDocument()
    expect(screen.getByText('Café de prueba')).toBeInTheDocument()
  })

  it('appears only with the feature on and real ant expenses', () => {
    ants.data = { monthTotalCents: 1_200_000 }
    renderHome()
    expect(hormigas()).toHaveTextContent('$12.000')
    expect(hormigas()).toHaveAttribute('href', '/hormigas')
  })

  it('with no ant expenses (total $0) it is not shown, nor a "—" placeholder', () => {
    ants.data = { monthTotalCents: 0 }
    renderHome()
    expect(hormigas()).toBeNull()
  })

  it('turned off it stays hidden even with expenses', () => {
    ants.data = { monthTotalCents: 1_200_000 }
    renderHome({ antsOn: false })
    expect(hormigas()).toBeNull()
  })
})
