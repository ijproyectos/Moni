import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IncomeByMonthPage } from './IncomeByMonthPage'
import type { PeriodSummary } from '../domain/periodSummary'

const period = vi.hoisted(() => ({
  calls: [] as Array<[string, string]>,
  state: { data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as {
    data: PeriodSummary | undefined
    isLoading: boolean
    isError: boolean
    refetch: () => void
  },
}))

vi.mock('../api/useMonthSummary', () => ({
  usePeriodSummary: (from: string, to: string) => {
    period.calls.push([from, to])
    return period.state
  },
}))

const summary = (daily: PeriodSummary['daily']): PeriodSummary => ({
  incomeCents: 0,
  expenseCents: 0,
  balanceCents: 0,
  byCategory: [],
  daily,
})

function setup() {
  render(
    <MemoryRouter>
      <IncomeByMonthPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const thisYear = new Date().getFullYear()

describe('IncomeByMonthPage', () => {
  beforeEach(() => {
    period.calls.length = 0
    period.state = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
  })

  it('lists the 12 months with the annual total and mutes months without income', () => {
    period.state.data = summary([
      { day: `${thisYear}-01-05`, incomeCents: 100_000_00, expenseCents: 0 },
      { day: `${thisYear}-01-25`, incomeCents: 20_000_00, expenseCents: 5_000_00 },
      { day: `${thisYear}-02-10`, incomeCents: 30_000_00, expenseCents: 0 },
    ])
    setup()
    const list = screen.getByRole('list', { name: `Ingresos por mes de ${thisYear}` })
    expect(within(list).getAllByRole('listitem')).toHaveLength(12)
    const january = within(list).getByText('Enero').closest('li') as HTMLElement
    expect(january).toHaveTextContent(/120\.000/)
    const march = within(list).getByText('Marzo').closest('li') as HTMLElement
    expect(march).toHaveTextContent(/\$\s?0/)
    expect(march).toHaveClass('text-text-muted')
    expect(screen.getByLabelText('Total anual')).toHaveTextContent(/150\.000/)
    expect(period.calls[0]).toEqual([`${thisYear}-01-01`, `${thisYear + 1}-01-01`])
  })

  it('moves between years but never past the current one', async () => {
    const user = setup()
    expect(screen.getByRole('button', { name: 'Año siguiente' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Año anterior' }))
    expect(screen.getByRole('heading', { name: String(thisYear - 1) })).toBeVisible()
    expect(period.calls.at(-1)).toEqual([`${thisYear - 1}-01-01`, `${thisYear}-01-01`])
    expect(screen.getByRole('button', { name: 'Año siguiente' })).toBeEnabled()
  })

  it('shows an error with retry instead of a made-up total', async () => {
    period.state.isError = true
    const user = setup()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus ingresos')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(period.state.refetch).toHaveBeenCalled()
    expect(screen.getByLabelText('Total anual')).toHaveTextContent('—')
  })
})
