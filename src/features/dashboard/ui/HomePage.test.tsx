import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomePage } from './HomePage'

const AVAILABLE = 500_000_00

// What the server answers per month: the selected month's own income and expenses, and the same available money
// (today's balance of the accounts) whatever the month.
const summary = (over: Partial<MonthSummary> = {}): MonthSummary => ({
  incomeCents: 0,
  expenseCents: 0,
  balanceCents: 0,
  availableBalanceCents: AVAILABLE,
  byCategory: [],
  daily: [],
  recent: [],
  ...over,
})
const SUMMARIES: Record<string, MonthSummary> = {
  '2026-11-01': summary({ incomeCents: 1_000_000_00, expenseCents: 300_000_00 }),
  '2026-10-01': summary({ incomeCents: 900_000_00, expenseCents: 70_000_00 }),
  '2026-01-01': summary({ incomeCents: 50_000_00, expenseCents: 12_345_67 }),
  '2025-12-01': summary({ incomeCents: 0, expenseCents: 15_000_00 }),
  // 2026-09 has no movements at all.
}
const asked = vi.hoisted(() => ({ months: [] as string[] }))

vi.mock('../api/useMonthSummary', () => ({
  useMonthSummary: (month: string) => {
    asked.months.push(month)
    return {
      isLoading: false,
      isError: false,
      data: SUMMARIES[month] ?? summary(),
      refetch: vi.fn(),
    }
  },
  // The header totals the whole history, whatever month is picked.
  usePeriodSummary: () => ({
    isLoading: false,
    isError: false,
    data: { incomeCents: 4_000_000_00, expenseCents: 800_000_00 },
  }),
}))
vi.mock('@/features/auth/api/authContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.c' } }),
}))
vi.mock('@/features/auth/api/useProfile', () => ({
  useProfile: () => ({ data: { display_name: 'Iara', avatar_url: null } }),
}))
vi.mock('@/features/onboarding/api/useGoals', () => ({
  useEnabledFeatures: () => new Set<string>(),
}))
vi.mock('@/features/goals/api/useSavings', () => ({
  useSavings: () => ({ data: { goals: [] } }),
  useSavingsNoticeCount: () => 0,
}))
vi.mock('@/features/goals/ui/SavingsNotices', () => ({ SavingsNotices: () => null }))
vi.mock('@/features/recurring/ui/RecurringReminders', () => ({ RecurringReminders: () => null }))
vi.mock('@/features/recurring/api/useRecurringReminders', () => ({
  useRecurringReminders: () => [],
}))
vi.mock('@/features/debts/api/useDebts', () => ({ useUnreadNoticeCount: () => 0 }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => ({ isPlus: false }) }))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/transactions/api/useTransactions', () => ({
  useTransactions: () => ({ data: [] }),
}))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn() }),
}))
vi.mock('@/features/budgets/api/useBudgets', () => ({ useBudgetStatus: () => ({ data: [] }) }))
vi.mock('@/features/insights/api/useAnts', () => ({
  useAnts: () => ({ data: { monthTotalCents: 0 } }),
}))

function setup() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const header = () => screen.getByRole('group', { name: 'Gastos e ingresos del mes' })
const available = () => screen.getByText('Dinero disponible').parentElement as HTMLElement

async function pick(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByRole('button', { name: /(\w+) de? ?\d{4}|\w+ \d{4}/ }))
  await user.click(
    within(screen.getByRole('listbox', { name: 'Mes' })).getByRole('option', { name: label }),
  )
}

describe('Inicio: importes de la tarjeta principal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00-03:00'))
    asked.months = []
  })
  afterEach(() => vi.useRealTimers())

  it('shows the whole-history income and expenses and the available money', () => {
    setup()
    expect(header()).toHaveTextContent('-$800.000')
    expect(header()).toHaveTextContent('+$4.000.000')
    expect(available()).toHaveTextContent('$500.000')
  })

  it('keeps the header amounts when another month is picked, and still loads that month', async () => {
    const user = setup()
    await pick(user, /octubre/i)
    expect(asked.months).toContain('2026-10-01')
    expect(header()).toHaveTextContent('-$800.000')
    expect(header()).toHaveTextContent('+$4.000.000')
    expect(available()).toHaveTextContent('$500.000')
  })

  it('a month with no movements does not read as $0 in the header', async () => {
    const user = setup()
    await pick(user, /septiembre/i)
    expect(header()).not.toHaveTextContent('$0Gastos')
    expect(header()).toHaveTextContent('+$4.000.000')
    expect(available()).toHaveTextContent('$500.000')
  })

  it('a month of the previous year keeps the header amounts too', async () => {
    const user = setup()
    await pick(user, /diciembre.*2025/i)
    expect(asked.months).toContain('2025-12-01')
    expect(header()).toHaveTextContent('-$800.000')
    expect(header()).toHaveTextContent('+$4.000.000')
  })
})
