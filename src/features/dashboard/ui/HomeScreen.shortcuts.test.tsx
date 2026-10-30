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

function renderHome(props: { goals?: { count: number }; antsOn?: boolean } = {}) {
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
        goals={
          props.goals
            ? { reservedCents: 100, targetCents: 1_000, count: props.goals.count }
            : undefined
        }
      />
    </MemoryRouter>,
  )
}

const metas = () => screen.queryByRole('link', { name: /Metas/ })
const hormigas = () => screen.queryByRole('link', { name: /Hormigas/ })

beforeEach(() => {
  ants.data = undefined
})

describe('Home: Metas and Hormigas only when there is something real to show', () => {
  it('shows neither by default, and "Últimos movimientos" takes their place', () => {
    renderHome()
    expect(metas()).toBeNull()
    expect(hormigas()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Últimos movimientos' })).toBeInTheDocument()
  })

  it('Metas appears with at least one active goal', () => {
    renderHome({ goals: { count: 1 } })
    expect(metas()).toHaveAttribute('href', '/metas')
    expect(hormigas()).toBeNull()
  })

  it('Hormigas appears only with the feature on and real ant expenses', () => {
    ants.data = { monthTotalCents: 1_200_000 }
    renderHome()
    expect(hormigas()).toHaveTextContent('$12.000')
    expect(metas()).toBeNull()
  })

  it('Hormigas with no ant expenses (total $0) is not shown, nor a "—" placeholder', () => {
    ants.data = { monthTotalCents: 0 }
    renderHome()
    expect(hormigas()).toBeNull()
  })

  it('Hormigas turned off stays hidden even with expenses', () => {
    ants.data = { monthTotalCents: 1_200_000 }
    renderHome({ antsOn: false })
    expect(hormigas()).toBeNull()
  })

  it('with both, they share the row; with one, it takes the full width', () => {
    ants.data = { monthTotalCents: 1_200_000 }
    renderHome({ goals: { count: 2 } })
    expect(metas()?.parentElement).toHaveClass('grid-cols-2')
    expect(hormigas()?.parentElement).toBe(metas()?.parentElement)
  })

  it('the single card is not squeezed into half a row', () => {
    renderHome({ goals: { count: 1 } })
    expect(metas()?.parentElement).not.toHaveClass('grid-cols-2')
  })
})
