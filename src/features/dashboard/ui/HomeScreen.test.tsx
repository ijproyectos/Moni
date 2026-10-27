import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

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

function renderHome(summary: MonthSummary) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        month="2026-10-01"
        latestMonth="2026-10-01"
        onMonthChange={vi.fn()}
        initial="J"
        onAddMovement={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('HomeScreen', () => {
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
    expect(screen.getByText('Disponible en cuentas:')).toBeInTheDocument()
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
    expect(screen.getByText('60% del total')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Restaurante|Gastos compartidos/ }),
    ).not.toBeInTheDocument()
  })
})
