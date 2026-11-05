import { cleanup, render, screen } from '@testing-library/react'
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

function renderHome(goals?: Parameters<typeof HomeScreen>[0]['goals']) {
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

const section = () => screen.getByRole('heading', { name: 'Metas' }).closest('section')

describe('HomeScreen: the Metas summary shows REAL goals', () => {
  it('shows the share saved, what is reserved over what the goals aim for, and the link', () => {
    renderHome({ reservedCents: 200_000_00, targetCents: 1_000_000_00, count: 1 })
    expect(section()).toHaveTextContent('20%')
    expect(section()).toHaveTextContent('$200.000 de $1.000.000')
    expect(screen.getByRole('link', { name: 'Ver la meta' })).toHaveAttribute('href', '/metas')
  })

  it('says how many goals there are in the link', () => {
    renderHome({ reservedCents: 1, targetCents: 10, count: 3 })
    expect(screen.getByRole('link', { name: 'Ver las 3' })).toHaveAttribute('href', '/metas')
  })

  it('over 100 % the bar is full and the layout holds', () => {
    renderHome({ reservedCents: 1_300_000_00, targetCents: 1_000_000_00, count: 1 })
    expect(screen.getByRole('progressbar', { name: 'Avance de tus metas' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
  })

  it('tells what is still missing this month from the real plan, or that the plan is met', () => {
    renderHome({
      reservedCents: 200_000_00,
      targetCents: 1_000_000_00,
      count: 1,
      missingCents: 80_000_00,
      requiredCents: 100_000_00,
    })
    expect(section()).toHaveTextContent('Este mes faltan $80.000')
    cleanup()
    renderHome({
      reservedCents: 200_000_00,
      targetCents: 1_000_000_00,
      count: 1,
      missingCents: 0,
      requiredCents: 100_000_00,
    })
    expect(section()).toHaveTextContent('Este mes ya cumpliste tu plan.')
    cleanup()
    renderHome({ reservedCents: 1, targetCents: 10, count: 1, missingCents: null })
    expect(section()).not.toHaveTextContent('Este mes')
  })

  it('without an active goal it invites to create one (no 0 % filler)', () => {
    renderHome()
    expect(section()).toHaveTextContent('Todavía no tenés metas')
    expect(screen.getByRole('link', { name: 'Crear' })).toHaveAttribute('href', '/metas')
    expect(screen.queryByRole('progressbar', { name: 'Avance de tus metas' })).toBeNull()
  })

  it('Dinero disponible does not change with the goals: it is the real balance', () => {
    renderHome({ reservedCents: 500_000_00, targetCents: 1_000_000_00, count: 1 })
    expect(screen.getByRole('link', { name: 'Ver tus medios de pago' })).toHaveTextContent(
      '568.000',
    )
  })
})
