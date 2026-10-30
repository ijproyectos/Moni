import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

// Same stubs as the base HomeScreen test: the budget and ants hooks need a query client.
vi.mock('@/features/budgets/api/useBudgets', () => ({ useBudgetStatus: () => ({ data: [] }) }))
vi.mock('@/features/insights/api/useAnts', () => ({
  useAnts: () => ({ data: { monthTotalCents: 1_200_000 } }),
}))

const summary: MonthSummary = {
  incomeCents: 100_000_00,
  expenseCents: 0,
  balanceCents: 0,
  availableBalanceCents: 568_000_00,
  byCategory: [],
  daily: [],
  recent: [],
}

function renderHome(goals?: { reservedCents: number; targetCents: number }) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        month="2026-10-01"
        latestMonth="2026-10-01"
        onMonthChange={vi.fn()}
        initial="J"
        onAddMovement={vi.fn()}
        goals={goals}
      />
    </MemoryRouter>,
  )
}

describe('HomeScreen: the Metas card shows REAL goals', () => {
  it('shows the progress of what is reserved over what the active goals aim for', () => {
    renderHome({ reservedCents: 200_000_00, targetCents: 1_000_000_00 })
    const card = screen.getByRole('link', { name: /Metas/ })
    expect(card).toHaveAttribute('href', '/metas')
    expect(card).toHaveTextContent('20% juntado')
  })

  it('over 100 % the bar is full and the card keeps its layout', () => {
    renderHome({ reservedCents: 1_300_000_00, targetCents: 1_000_000_00 })
    expect(screen.getByRole('progressbar', { name: 'Avance de tus metas' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
  })

  it('without goals it shows 0 % (no simulated data) and the link stays', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /Metas/ })).toHaveTextContent('0% juntado')
  })

  it('Dinero disponible does not change with the goals: it is the real balance', () => {
    renderHome({ reservedCents: 500_000_00, targetCents: 1_000_000_00 })
    expect(screen.getByRole('link', { name: 'Ver tus medios de pago' })).toHaveTextContent(
      '568.000',
    )
  })
})
