import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { dismissalStorageKey } from '../domain/reminderDismissal'
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

  describe('dismissal', () => {
    const luz = { key: 'fixed-1', text: 'Hoy vence tu factura de luz', to: '/recurrentes' }
    const netflix = { key: 'sub-1', text: 'Mañana se cobra Netflix', to: '/recurrentes' }
    beforeEach(() => window.localStorage.clear())
    afterEach(() => vi.restoreAllMocks())

    it('closes with "Cerrar aviso" and stays closed on the next render', async () => {
      reminders.current = [luz]
      const { unmount } = renderIt()
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
      expect(screen.queryByRole('region', { name: 'Recordatorios de pagos' })).toBeNull()
      expect(window.localStorage.getItem(dismissalStorageKey('anonymous'))).not.toBeNull()
      unmount()
      renderIt()
      expect(screen.queryByRole('region', { name: 'Recordatorios de pagos' })).toBeNull()
    })

    it('comes back when the set of reminders changes', async () => {
      reminders.current = [luz]
      const { unmount } = renderIt()
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
      unmount()
      reminders.current = [luz, netflix]
      renderIt()
      expect(screen.getByRole('region', { name: 'Recordatorios de pagos' })).toBeInTheDocument()
    })

    it('comes back the next day', async () => {
      reminders.current = [luz]
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 30, 12))
      const first = renderIt()
      first.unmount()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderIt()
      await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
      vi.setSystemTime(new Date(2026, 9, 31, 12))
      document.body.innerHTML = ''
      renderIt()
      expect(screen.getByRole('region', { name: 'Recordatorios de pagos' })).toBeInTheDocument()
      vi.useRealTimers()
    })

    it('still closes when localStorage throws', async () => {
      reminders.current = [luz]
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied')
      })
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied')
      })
      renderIt()
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
      expect(screen.queryByRole('region', { name: 'Recordatorios de pagos' })).toBeNull()
    })
  })
})
