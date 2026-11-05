import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { MonthReportPage } from './MonthReportPage'

const asked = vi.hoisted(() => ({ months: [] as string[] }))
const summary: MonthSummary = {
  incomeCents: 0,
  expenseCents: 439_850_00,
  balanceCents: -439_850_00,
  availableBalanceCents: 0,
  byCategory: [
    {
      categoryId: 'a',
      name: 'Gastos compartidos',
      color: '#064735',
      icon: 'Users',
      amountCents: 224_700_00,
      percent: 51,
    },
    {
      categoryId: 'b',
      name: 'Salidas',
      color: '#2f9e8f',
      icon: 'Wine',
      amountCents: 104_700_00,
      percent: 24,
    },
  ],
  daily: [],
  recent: [],
}
vi.mock('../api/useMonthSummary', () => ({
  useMonthSummary: (month: string) => {
    asked.months.push(month)
    return { isLoading: false, isError: false, data: summary }
  },
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      { id: '1', name: 'Galicia', kind: 'bank', balanceCents: 115_300_00, archivedAt: null },
      { id: '2', name: 'Efectivo', kind: 'cash', balanceCents: 50_000_00, archivedAt: null },
    ],
  }),
}))

function setup() {
  render(
    <MemoryRouter>
      <MonthReportPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('MonthReportPage (Informes)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00-03:00'))
    asked.months = []
  })
  afterEach(() => vi.useRealTimers())

  it('shows the month spending, what is left and the total balance of the accounts', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Informes' })).toBeInTheDocument()
    expect(screen.getByText(/Gastaste en el mes/)).toBeInTheDocument()
    expect(screen.getByText(/Ingresaste \$0 y te quedaron/)).toBeInTheDocument()
    expect(screen.getByText('$165.300')).toBeInTheDocument()
    expect(screen.getByText('2 medios de pago')).toBeInTheDocument()
  })

  it('lists each category with its real share and amount', () => {
    setup()
    const row = screen.getByText('Gastos compartidos').closest('li') as HTMLElement
    expect(within(row).getByText('51% del total')).toBeInTheDocument()
    expect(within(row).getByText(/224\.700/)).toBeInTheDocument()
    expect(screen.getByText('2 categorías')).toBeInTheDocument()
  })

  it('links to the year report and to the assistant', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Tu año' })).toHaveAttribute('href', '/tu-anio')
    expect(screen.getByRole('link', { name: /Asistente/ })).toBeInTheDocument()
  })

  it('asks the server for the month it shows, starting with the current one', () => {
    setup()
    expect(asked.months).toContain('2026-11-01')
  })
})
