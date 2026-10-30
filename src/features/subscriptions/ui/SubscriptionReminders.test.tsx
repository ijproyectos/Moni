import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SubscriptionReminders } from './SubscriptionReminders'

const reminders = vi.hoisted(() => ({ current: [] as { subscriptionId: string; text: string }[] }))
vi.mock('../api/useSubscriptions', () => ({ useSubscriptionReminders: () => reminders.current }))

describe('SubscriptionReminders', () => {
  it('renders nothing when there is nothing to remind', () => {
    reminders.current = []
    const { container } = render(
      <MemoryRouter>
        <SubscriptionReminders />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("shows tomorrow's charges and clarifies they are in-app notices, not push", () => {
    reminders.current = [
      { subscriptionId: 's1', text: 'Mañana se cobra Netflix: $18.000 de Galicia' },
    ]
    render(
      <MemoryRouter>
        <SubscriptionReminders />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Mañana se cobra Netflix/ })).toHaveAttribute(
      'href',
      '/fijos',
    )
    expect(screen.getByText(/Todavía no enviamos notificaciones push/)).toBeInTheDocument()
  })
})
