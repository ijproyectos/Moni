import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

// HomeScreen is presentational; the budget and ants hooks need a query client, so stub them here.
const budgetStatus = vi.hoisted(() => ({ data: [] as unknown[] }))
vi.mock('@/features/budgets/api/useBudgets', () => ({
  useBudgetStatus: () => ({ data: budgetStatus.data }),
}))
vi.mock('@/features/insights/api/useAnts', () => ({
  useAnts: () => ({ data: { monthTotalCents: 1_200_000 } }),
}))

const empty: MonthSummary = {
  incomeCents: 0,
  expenseCents: 0,
  balanceCents: 0,
  availableBalanceCents: 0,
  byCategory: [],
  daily: [],
  recent: [],
}

const withData: MonthSummary = {
  ...empty,
  expenseCents: 11_950_000,
  incomeCents: 97_000_000,
  balanceCents: 85_050_000,
  availableBalanceCents: 85_050_000,
  byCategory: [
    {
      categoryId: 'a',
      name: 'Súper',
      color: '#064735',
      icon: 'ShoppingCart',
      amountCents: 3_824_000,
      percent: 32,
    },
    {
      categoryId: 'b',
      name: 'Comida',
      color: '#E5533D',
      icon: 'Utensils',
      amountCents: 2_868_000,
      percent: 24,
    },
  ],
}

function renderHome(summary: MonthSummary, isPlus?: boolean) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        month="2026-10-01"
        latestMonth="2026-10-01"
        onMonthChange={vi.fn()}
        initial="J"
        onAddMovement={vi.fn()}
        isPlus={isPlus}
      />
    </MemoryRouter>,
  )
}

describe('HomeScreen', () => {
  afterEach(() => {
    budgetStatus.data = []
  })

  it('shows a friendly insight and an empty state without data', () => {
    renderHome(empty)
    expect(screen.getByText(/todavía no cargaste gastos este mes/)).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay movimientos')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Gastos por categoría' })).not.toBeInTheDocument()
  })

  it('computes the insight and donut from real data', () => {
    renderHome(withData)
    expect(
      screen.getByText(/tu mayor gasto del mes es Súper, con el 32% del total/),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Gastos por categoría' })).toBeInTheDocument()
    expect(screen.getByText('32%')).toBeInTheDocument()
  })

  it('renders virtual template categories from shared expenses without links', () => {
    renderHome({
      ...withData,
      byCategory: [
        {
          categoryId: 'template:restaurant',
          name: 'Restaurante',
          color: '#E5533D',
          icon: 'Utensils',
          amountCents: 3_334,
          percent: 60,
        },
        {
          categoryId: 'template:none',
          name: 'Gastos compartidos',
          color: '#2F9E8F',
          icon: 'Users',
          amountCents: 2_000,
          percent: 40,
        },
      ],
    })
    expect(screen.getAllByText('Restaurante').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gastos compartidos').length).toBeGreaterThan(0)
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Restaurante|Gastos compartidos/ }),
    ).not.toBeInTheDocument()
  })

  it('the PLUS badge on the avatar follows the Plus status it is given', () => {
    renderHome(withData, true)
    expect(screen.getByText('✦ PLUS')).toBeInTheDocument()
  })

  it('there is no PLUS badge on Free', () => {
    renderHome(withData)
    expect(screen.queryByText('✦ PLUS')).not.toBeInTheDocument()
  })

  it('shows the real ants total of the month in the shortcut', () => {
    renderHome(withData)
    expect(screen.getByRole('link', { name: /Hormigas/ })).toHaveTextContent('$12.000')
    expect(screen.getByRole('link', { name: /Hormigas/ })).toHaveTextContent('este mes')
  })

  it('warns about budgets at 80% or more and stays quiet otherwise', () => {
    renderHome(withData)
    expect(screen.queryByText('Ojo con tus límites')).not.toBeInTheDocument()

    budgetStatus.data = [
      {
        budgetId: 'b1',
        categoryId: 'a',
        name: 'Súper',
        color: '#064735',
        icon: 'ShoppingCart',
        amountCents: 3_000_000,
        spentCents: 3_824_000,
        remainingCents: -824_000,
        percent: 127.5,
        state: 'over',
      },
    ]
    renderHome(withData)
    expect(screen.getByText('Ojo con tus límites')).toBeInTheDocument()
    expect(screen.getByText('Te pasaste $8.240 en Súper')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver límites' })).toHaveAttribute('href', '/categorias')
  })
})
