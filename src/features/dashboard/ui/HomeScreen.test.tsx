import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

// HomeScreen is presentational; the budget and ants hooks need a query client, so stub them here.
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

function renderHome(
  summary: MonthSummary,
  isPlus?: boolean,
  movements?: RecentMovement[],
  extra: Partial<Parameters<typeof HomeScreen>[0]> = {},
) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        movements={movements}
        month="2026-10-01"
        latestMonth="2026-10-01"
        onMonthChange={vi.fn()}
        initial="J"
        onAddMovement={vi.fn()}
        isPlus={isPlus}
        {...extra}
      />
    </MemoryRouter>,
  )
}

describe('HomeScreen', () => {
  it('lists the newest movements grouped by day, even when the picked month is empty', () => {
    const movement = (id: string, occurredOn: string, note: string): RecentMovement => ({
      id,
      kind: 'expense',
      amountCents: 1_000_00,
      occurredOn,
      note,
      accountId: 'a',
      accountName: 'Efectivo',
      categoryName: 'Comida',
      categoryColor: '#E5533D',
      categoryIcon: 'Utensils',
    })
    renderHome(empty, false, [
      movement('m1', '2026-10-31', 'Cena'),
      movement('m2', '2026-09-30', 'Almuerzo'),
    ])
    expect(screen.queryByText('Todavía no hay movimientos')).not.toBeInTheDocument()
    const saturday = screen.getByRole('region', { name: 'Sábado, 31 de octubre' })
    expect(saturday).toHaveTextContent('Cena')
    expect(saturday).toHaveTextContent('Comida · Efectivo')
    expect(screen.getByRole('region', { name: 'Miércoles, 30 de septiembre' })).toHaveTextContent(
      'Almuerzo',
    )
  })

  it('shows the totals of the month it is given', () => {
    renderHome(withData)
    const group = screen.getByRole('group', { name: 'Gastos e ingresos del mes' })
    expect(group).toHaveTextContent('-$119.500')
    expect(group).toHaveTextContent('+$970.000')
  })

  it('shows an empty state without data', () => {
    renderHome(empty)
    expect(screen.getByText('Todavía no hay movimientos')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Gastos por categoría' })).not.toBeInTheDocument()
  })

  it('draws the spending of the month from real data', () => {
    renderHome(withData)
    expect(screen.getByRole('img', { name: 'Gastos por categoría' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Categorías principales' })
    expect(within(list).getByText('32%')).toBeInTheDocument()
    expect(within(list).getByText('Súper')).toBeInTheDocument()
    expect(within(list).getByText('-$38.240')).toBeInTheDocument()
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
    const list = screen.getByRole('list', { name: 'Categorías principales' })
    expect(within(list).getByText('60%')).toBeInTheDocument()
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

  describe('Para hoy only shows what is real', () => {
    it('has no "Para hoy" without stories', () => {
      renderHome(empty)
      expect(screen.queryByRole('heading', { name: 'Para hoy' })).toBeNull()
    })

    it('shows a bubble per story, in the order it is given, and opens the one tapped', async () => {
      const story = (id: string, label: string, bubble: string) => ({
        id,
        signature: id,
        label,
        bubble,
        tone: 'gold' as const,
        priority: 1,
        slides: [{ title: `Título ${label}`, body: `Cuerpo ${label}` }],
      })
      renderHome(withData, false, undefined, {
        stories: [story('a', 'Cobros', '2'), story('b', 'Metas', '7%')],
      })
      const section = screen.getByRole('heading', { name: 'Para hoy' }).closest('section')
      expect(section).toHaveTextContent('2Cobros')
      expect(section).toHaveTextContent('7%Metas')
      await userEvent.setup().click(screen.getByRole('button', { name: /^Metas/ }))
      expect(screen.getByRole('dialog', { name: 'Historia: Metas' })).toHaveTextContent(
        'Cuerpo Metas',
      )
    })

    it('no longer draws the balance chart, even when a series is given', () => {
      renderHome(withData, false, undefined, {
        balanceSeries: [
          { date: '2026-10-01', cents: 1_000_00 },
          { date: '2026-10-02', cents: 850_50 },
        ],
      })
      expect(screen.queryByRole('img', { name: /Evolución de tu dinero/ })).toBeNull()
      expect(screen.queryByText(/Todavía no hay movimientos suficientes/)).toBeNull()
      expect(screen.getByText('Dinero disponible')).toBeInTheDocument()
    })
  })
})
