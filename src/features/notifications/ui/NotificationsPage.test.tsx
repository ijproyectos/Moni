import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { NotificationsPage } from './NotificationsPage'

const state = vi.hoisted(() => ({
  reminders: [] as { key: string; text: string; to: string }[],
  budgets: [] as unknown[],
}))
vi.mock('@/features/recurring/api/useRecurringReminders', () => ({
  useRecurringReminders: () => state.reminders,
}))
vi.mock('@/features/budgets/api/useBudgets', () => ({
  useBudgetStatus: () => ({ data: state.budgets }),
}))
vi.mock('@/features/goals/ui/SavingsNotices', () => ({ SavingsNotices: () => null }))

function setup() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <NotificationsPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('NotificationsPage', () => {
  it('is honest when there is nothing to tell', () => {
    state.reminders = []
    state.budgets = []
    setup()
    expect(screen.getByText('Todo al día')).toBeInTheDocument()
    expect(screen.getByText(/No tenés avisos por ahora/)).toBeInTheDocument()
    expect(screen.queryByText('Hoy')).toBeNull()
  })

  it('groups the real notices under "Hoy" with the count in the header', () => {
    state.reminders = [{ key: 'fixed-1', text: 'Mañana vence tu factura de luz.', to: '/recurrentes' }]
    state.budgets = [
      {
        budgetId: 'b1',
        categoryId: 'c1',
        name: 'Delivery',
        color: '#000000',
        icon: 'Utensils',
        amountCents: 8_000_000,
        spentCents: 9_600_000,
        remainingCents: -1_600_000,
        percent: 120,
        state: 'over',
      },
    ]
    setup()
    expect(screen.getByText('2 avisos')).toBeInTheDocument()
    const today = screen.getByRole('region', { name: 'Hoy' })
    expect(within(today).getByRole('link', { name: /Mañana vence tu factura de luz/ })).toHaveAttribute('href', '/recurrentes')
    expect(within(today).getByRole('link', { name: /Te pasaste en Delivery/ })).toHaveAttribute('href', '/presupuesto')
    expect(screen.queryByRole('region', { name: 'Esta semana' })).toBeNull()
  })
})
