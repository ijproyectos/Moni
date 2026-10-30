import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { goalReminders, savingsAlerts } from '../domain/savings'
import { makeGoal, makeSavings, makeSavingsAccount } from '../domain/testing'
import { SavingsNotices } from './SavingsNotices'

const skip = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const data = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../api/useSavings', async () => {
  const domain = await import('../domain/savings')
  return {
    useSavings: () => ({ data: data.current }),
    useSavingsAlerts: () => (data.current ? domain.savingsAlerts(data.current as never) : []),
    useGoalReminders: () => (data.current ? domain.goalReminders(data.current as never) : []),
    useSkipReminder: () => ({ mutateAsync: skip, isPending: false }),
    useAddDeposit: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useWithdrawReserve: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useSnoozeReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }
})

function setup(overview: ReturnType<typeof makeSavings>) {
  data.current = overview
  const view = render(
    <MemoryRouter>
      <ToastProvider>
        <SavingsNotices />
      </ToastProvider>
    </MemoryRouter>,
  )
  return { view, user: userEvent.setup() }
}

const compromised = makeSavingsAccount({
  balanceCents: 20_000_00,
  reservedCents: 30_000_00,
  freeCents: -10_000_00,
})

describe('SavingsNotices', () => {
  beforeEach(() => skip.mockClear())

  it('renders nothing when everything is fine', () => {
    const { view } = setup(makeSavings({ accounts: [makeSavingsAccount()], goals: [makeGoal()] }))
    expect(view.container.querySelector('section')).toBeNull()
    expect(screen.queryByText(/Ojo con tus ahorros/)).toBeNull()
  })

  it('one alert per compromised account, naming each goal affected, with the exact wording', () => {
    setup(
      makeSavings({
        accounts: [compromised],
        goals: [
          makeGoal({ id: 'a', name: 'Viaje', reservedCents: 20_000_00 }),
          makeGoal({ id: 'b', name: 'Auto', reservedCents: 10_000_00 }),
        ],
      }),
    )
    const alerts = screen.getAllByRole('region', { name: /Ahorros comprometidos/ })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(
      '¡Ojo con tus ahorros! Tenés $30.000 reservados para tus metas en Galicia, pero tu saldo actual es de $20.000. Te faltan $10.000 para cubrirlos.',
    )
    expect(screen.getByRole('link', { name: 'Viaje' })).toHaveAttribute(
      'href',
      '/metas/g1'.replace('g1', 'a'),
    )
    expect(screen.getByRole('link', { name: 'Auto' })).toBeInTheDocument()
    expect(screen.getByText(/No tocamos tus reservas/)).toBeInTheDocument()
  })

  it('re-rendering with the same data does not multiply the alert', () => {
    const overview = makeSavings({
      accounts: [compromised],
      goals: [makeGoal({ reservedCents: 30_000_00 })],
    })
    const { view } = setup(overview)
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <SavingsNotices />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('region', { name: /Ahorros comprometidos/ })).toHaveLength(1)
    expect(savingsAlerts(overview as never)).toHaveLength(1)
  })

  it('a due reminder asks the question and offers: add a contribution, postpone or skip', async () => {
    const { user } = setup(
      makeSavings({
        accounts: [makeSavingsAccount()],
        goals: [
          makeGoal({
            name: 'tu viaje',
            remind: true,
            frequency: 'monthly',
            suggestedCents: 30_000_00,
            reminderOn: '2026-11-10',
          }),
        ],
      }),
    )
    expect(
      screen.getByText(
        'Hoy te propusiste ahorrar $30.000 para tu viaje. ¿Querés agregar un aporte?',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/No aportamos ni descontamos nada solos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar un aporte a tu viaje' }))
    expect(screen.getByRole('dialog', { name: 'Agregar a la meta' })).toBeInTheDocument()
  })

  it('postpone opens tomorrow / in a week / choose a date', async () => {
    const { user } = setup(
      makeSavings({
        accounts: [makeSavingsAccount()],
        goals: [makeGoal({ remind: true, frequency: 'weekly', reminderOn: '2026-11-10' })],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Posponer el recordatorio de Viaje' }))
    expect(screen.getByRole('dialog', { name: 'Posponer recordatorio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /En una semana/ })).toBeInTheDocument()
  })

  it('skip answers the reminder without contributing anything', async () => {
    const { user } = setup(
      makeSavings({
        accounts: [makeSavingsAccount()],
        goals: [makeGoal({ remind: true, frequency: 'weekly', reminderOn: '2026-11-10' })],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Omitir el recordatorio de Viaje' }))
    expect(skip).toHaveBeenCalledWith('g1')
  })

  it('a paused goal produces no reminder; an alert and a reminder can appear together', () => {
    const goals = [
      makeGoal({
        id: 'p',
        name: 'Pausada',
        status: 'paused',
        remind: true,
        frequency: 'weekly',
        reminderOn: '2026-11-10',
        reservedCents: 0,
      }),
      makeGoal({
        id: 'r',
        name: 'Activa',
        remind: true,
        frequency: 'weekly',
        reminderOn: '2026-11-10',
        reservedCents: 30_000_00,
      }),
    ]
    setup(makeSavings({ accounts: [compromised], goals }))
    expect(screen.queryByText(/Pausada/)).toBeNull()
    expect(goalReminders(makeSavings({ goals }))).toHaveLength(1)
    expect(screen.getAllByRole('region').length).toBe(2)
  })
})
