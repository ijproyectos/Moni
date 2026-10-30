import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RecurringReminders } from './RecurringReminders'

const reminders = vi.hoisted(() => ({ current: [] as { key: string; text: string; to: string }[] }))
vi.mock('../api/useRecurringReminders', () => ({ useRecurringReminders: () => reminders.current }))

function renderIt() {
  return render(
    <MemoryRouter>
      <RecurringReminders />
    </MemoryRouter>,
  )
}

describe('RecurringReminders', () => {
  it('renders nothing when there is nothing to remind', () => {
    reminders.current = []
    const { container } = renderIt()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows subscription charges and fixed expenses, each leading to its tab, and says it is not push', () => {
    reminders.current = [
      {
        key: 'fixed-1',
        text: 'Hoy vence tu factura de luz. ¿Cuánto pagaste?',
        to: '/recurrentes?tab=gastos-fijos',
      },
      { key: 'sub-1', text: 'Mañana se cobra Netflix: $18.000 de Galicia', to: '/recurrentes' },
    ]
    renderIt()
    expect(screen.getByRole('region', { name: 'Recordatorios de pagos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Hoy vence tu factura de luz/ })).toHaveAttribute(
      'href',
      '/recurrentes?tab=gastos-fijos',
    )
    expect(screen.getByRole('link', { name: /Mañana se cobra Netflix/ })).toHaveAttribute(
      'href',
      '/recurrentes',
    )
    expect(screen.getByText(/Todavía no enviamos notificaciones push/)).toBeInTheDocument()
  })
})
