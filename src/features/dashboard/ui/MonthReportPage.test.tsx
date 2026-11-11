import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { MonthReportPage } from './MonthReportPage'

const asked = vi.hoisted(() => ({ months: [] as string[][] }))

const slice = (id: string, name: string, amountCents: number, percent: number) => ({
  categoryId: id,
  name,
  color: '#2f9e8f',
  icon: 'Users',
  amountCents,
  percent,
})

function summaryFor(month: string): MonthSummary {
  const nov = month === '2026-11-01'
  return {
    incomeCents: nov ? 1_000_000_00 : 800_000_00,
    expenseCents: nov ? 900_000_00 : 700_000_00,
    balanceCents: 0,
    availableBalanceCents: 0,
    byCategory: [
      slice('a', 'Súper', nov ? 450_000_00 : 300_000_00, 50),
      slice('b', 'Salidas', nov ? 450_000_00 : 400_000_00, 50),
    ],
    daily: [],
    recent: [],
  }
}

vi.mock('../api/useMonthSummary', () => ({
  useMonthSummaries: (months: string[]) => {
    asked.months.push(months)
    return months.map((m) => ({ isLoading: false, isError: false, data: summaryFor(m) }))
  },
}))
vi.mock('@/features/assistant/ui/AssistantEntryLink', () => ({
  AssistantEntryLink: () => <a href="/informes/asistente">Asistente</a>,
}))

function setup() {
  render(
    <MemoryRouter>
      <MonthReportPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('MonthReportPage (Estadísticas)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00-03:00'))
    asked.months = []
  })
  afterEach(() => vi.useRealTimers())

  it('starts on the current month with Mes / 6 meses / Año', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Estadísticas' })).toBeInTheDocument()
    expect(screen.getAllByText('Noviembre 2026').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '6 meses' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Año' })).toBeInTheDocument()
  })

  it('shows the month total and the category legend with real shares', () => {
    setup()
    const card = screen.getByRole('region', { name: 'Por categoría' })
    expect(within(card).getByText('$900.000')).toBeInTheDocument()
    const legend = within(card).getByRole('list', { name: 'Categorías principales' })
    expect(within(legend).getByText('Súper')).toBeInTheDocument()
    expect(within(legend).getAllByText('50%')).toHaveLength(2)
  })

  it('says how much is saved against the 15% goal', () => {
    setup()
    const card = screen.getByRole('region', { name: 'Ahorro' })
    expect(card).toHaveTextContent('Ahorrás el 10% de tus ingresos')
    expect(card).toHaveTextContent('$100.000 por mes en promedio · meta 15%')
  })

  it('6 meses adds the months up and asks for six summaries', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '6 meses' }))
    expect(screen.getByText('Últimos 6 meses')).toBeInTheDocument()
    expect(asked.months.at(-1)).toHaveLength(6)
    const card = screen.getByRole('region', { name: 'Por categoría' })
    // 6 months x the same summary shape: 900k (Nov) + 5 x 700k
    expect(card).toHaveTextContent('$4.400.000')
  })

  it('Año covers January to the current month', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Año' }))
    expect(asked.months.at(-1)).toHaveLength(11)
    expect(screen.getByText('Año 2026')).toBeInTheDocument()
  })

  it('keeps the way to the year report and the assistant', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Tu año' })).toHaveAttribute('href', '/tu-anio')
    expect(screen.getByRole('link', { name: /Asistente/ })).toBeInTheDocument()
  })
})
