import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, argentinaTodayIso } from '@/shared/lib/month'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeGoal } from '../domain/testing'
import { SnoozeSheet } from './SnoozeSheet'

const snooze = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../api/useSavings', () => ({
  useSnoozeReminder: () => ({ mutateAsync: snooze, isPending: false }),
}))

const today = argentinaTodayIso()
function setup() {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <SnoozeSheet goal={makeGoal()} onClose={onClose} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('SnoozeSheet', () => {
  beforeEach(() => snooze.mockClear())

  it('offers tomorrow, in a week and a chosen date', () => {
    setup()
    expect(screen.getByRole('button', { name: /Mañana/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /En una semana/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Elegir fecha/ })).toBeInTheDocument()
  })

  it('tomorrow and in a week postpone to those dates', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: /Mañana/ }))
    await waitFor(() =>
      expect(snooze).toHaveBeenCalledWith({ goalId: 'g1', until: addDays(today, 1) }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('in a week', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /En una semana/ }))
    await waitFor(() =>
      expect(snooze).toHaveBeenCalledWith({ goalId: 'g1', until: addDays(today, 7) }),
    )
  })

  it('a chosen date postpones to it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Elegir fecha/ }))
    const date = screen.getByLabelText('Nueva fecha del recordatorio')
    await user.clear(date)
    await user.type(date, addDays(today, 20))
    await user.click(screen.getByRole('button', { name: 'Posponer' }))
    await waitFor(() =>
      expect(snooze).toHaveBeenCalledWith({ goalId: 'g1', until: addDays(today, 20) }),
    )
  })

  it('a date in the past or beyond 90 days cannot be chosen', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Elegir fecha/ }))
    const date = screen.getByLabelText('Nueva fecha del recordatorio')
    await user.clear(date)
    await user.type(date, today)
    expect(screen.getByRole('button', { name: 'Posponer' })).toBeDisabled()
    await user.clear(date)
    await user.type(date, addDays(today, 120))
    expect(screen.getByRole('button', { name: 'Posponer' })).toBeDisabled()
  })
})
