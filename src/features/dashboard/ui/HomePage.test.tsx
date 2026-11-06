import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomePage } from './HomePage'

const AVAILABLE = 500_000_00

// What the server answers for the current month: its own income and expenses, and the available money (today's
// balance of the accounts).
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
  useSavingsPlanData: () => ({ data: undefined }),
}))
vi.mock('@/features/recurring/api/useRecurringReminders', () => ({
  useRecurringReminders: () => [],
}))
vi.mock('../api/useHomeStories', () => ({ useHomeStories: () => [] }))
vi.mock('@/features/cards/api/useCards', () => ({
  useVoidInstallmentPlan: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/features/debts/api/useDebts', () => ({ useUnreadNoticeCount: () => 0 }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => ({ isPlus: false }) }))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))
vi.mock('@/features/categories/api/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/transactions/api/useTransactions', () => ({
  useTransactions: () => ({ data: [] }),
  useTransfers: () => ({ data: [] }),
  useVoidTransaction: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: vi.fn(), openEdit: vi.fn() }),
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

describe('Inicio: importes de la tarjeta principal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00-03:00'))
    asked.months = []
  })
  afterEach(() => vi.useRealTimers())

  it('shows the income and expenses of the current month and the available money', () => {
    setup()
    expect(header()).toHaveTextContent('-$300.000')
    expect(header()).toHaveTextContent('+$1.000.000')
    expect(available()).toHaveTextContent('$500.000')
  })

  it('always uses the current month: there is no month picker, label or arrows', () => {
    setup()
    expect(asked.months).toContain('2026-11-01')
    expect(asked.months).not.toContain('2026-10-01')
    expect(screen.queryByRole('listbox', { name: 'Mes' })).toBeNull()
    expect(screen.queryByRole('button', { name: /noviembre/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mes (anterior|siguiente)/ })).toBeNull()
    expect(screen.getByRole('banner')).not.toHaveTextContent(/noviembre/i)
  })
})
