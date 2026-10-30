import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { addDays, argentinaTodayIso } from '@/shared/lib/month'
import { ToastProvider } from '@/shared/ui/Toast'
import { nextWeekday } from '../domain/savings'
import { makeGoal, makeSavings, makeSavingsAccount } from '../domain/testing'
import { SavingsGoalFormSheet } from './SavingsGoalFormSheet'

const create = vi.hoisted(() => vi.fn().mockResolvedValue('id'))
const update = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const overview = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../api/useSavings', () => ({
  useSavings: () => ({ isLoading: false, data: overview.current }),
  useCreateSavingsGoal: () => ({ mutateAsync: create, isPending: false }),
  useUpdateSavingsGoal: () => ({ mutateAsync: update, isPending: false }),
}))

const today = argentinaTodayIso()
const accounts = [
  makeSavingsAccount({ id: 'galicia', name: 'Galicia', freeCents: 120_000_00 }),
  makeSavingsAccount({
    id: 'mp',
    name: 'Mercado Pago',
    kind: 'wallet',
    balanceCents: 10_000_00,
    reservedCents: 0,
    freeCents: 10_000_00,
  }),
  makeSavingsAccount({ id: 'vieja', name: 'Cuenta vieja', archived: true }),
]

function setup(props: Partial<Parameters<typeof SavingsGoalFormSheet>[0]> = {}) {
  overview.current = makeSavings({ accounts, goals: props.goal ? [props.goal] : [] })
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <ToastProvider>
        <SavingsGoalFormSheet onClose={onClose} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return { onClose, user: userEvent.setup() }
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>, target = '600000') {
  await user.type(screen.getByLabelText('Nombre'), 'Viaje a Brasil')
  await user.type(screen.getByLabelText('Monto objetivo'), target)
}

describe('SavingsGoalFormSheet', () => {
  beforeEach(() => {
    create.mockClear()
    update.mockClear()
  })

  it('offers the kinds of goal: viaje, auto, casa, computadora, emergencia, estudios and otra', () => {
    setup()
    const kinds = screen.getByRole('group', { name: 'Tipo de meta' })
    for (const label of [
      'Viaje',
      'Auto',
      'Casa',
      'Computadora',
      'Emergencia',
      'Estudios',
      'Otra',
    ]) {
      expect(within(kinds).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('a kind proposes its name; a name the person typed is never replaced', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Emergencia' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Fondo de emergencia')
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Mi colchón')
    await user.click(screen.getByRole('button', { name: 'Auto' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Mi colchón')
  })

  it('only active accounts of cash, banks and wallets are offered, each with its free money', () => {
    setup()
    const select = screen.getByLabelText('Cuenta de la meta')
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Galicia · libre $120.000', 'Mercado Pago · libre $10.000'])
    expect(screen.getByText(/no es un gasto ni una transferencia/)).toBeInTheDocument()
  })

  it('creates a goal with the minimum: name, target, account (everything else optional)', async () => {
    const { user, onClose } = setup()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Crear meta' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const { input, requestKey } = create.mock.calls[0]?.[0] ?? {}
    expect(input).toMatchObject({
      name: 'Viaje a Brasil',
      icon: 'viaje',
      targetCents: 600_000_00,
      accountId: 'galicia',
      targetDate: null,
      frequency: 'free',
      suggestedCents: null,
      remind: false,
      firstReminderOn: null,
      initialCents: null,
    })
    expect(requestKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('saves with an initial reserved amount, a target date, and another account', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.selectOptions(
      screen.getByLabelText('Cuenta de la meta'),
      'Mercado Pago · libre $10.000',
    )
    await user.type(screen.getByLabelText('Monto inicial reservado'), '5000')
    await user.click(screen.getByRole('button', { name: '6 meses' }))
    await user.click(screen.getByRole('button', { name: 'Crear meta' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    const { input } = create.mock.calls[0]?.[0] ?? {}
    expect(input).toMatchObject({ accountId: 'mp', initialCents: 5_000_00 })
    expect(input.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('an initial amount above the free money shows the free amount and corrects it with one tap', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.selectOptions(
      screen.getByLabelText('Cuenta de la meta'),
      'Mercado Pago · libre $10.000',
    )
    await user.type(screen.getByLabelText('Monto inicial reservado'), '50000')
    expect(screen.getByRole('alert')).toHaveTextContent('Mercado Pago tiene $10.000 libres')
    expect(screen.getByRole('button', { name: 'Crear meta' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Usar $10.000' }))
    expect(screen.getByLabelText('Monto inicial reservado')).toHaveValue('10.000')
    expect(screen.getByRole('button', { name: 'Crear meta' })).toBeEnabled()
  })

  it('the suggested amount per contribution is completely optional (and must be positive if typed)', async () => {
    const { user } = setup()
    await fillBasics(user)
    expect(screen.getByRole('button', { name: 'Crear meta' })).toBeEnabled()
    await user.type(screen.getByLabelText('Importe orientativo'), '0')
    expect(screen.getByRole('button', { name: 'Crear meta' })).toBeDisabled()
    await user.clear(screen.getByLabelText('Importe orientativo'))
    await user.type(screen.getByLabelText('Importe orientativo'), '30000')
    await user.click(screen.getByRole('button', { name: 'Crear meta' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]?.[0].input.suggestedCents).toBe(30_000_00)
  })

  it('"Cuando quiera" has no reminders; a frequency turns the reminder on with a first date', async () => {
    const { user } = setup()
    expect(screen.queryByRole('switch', { name: 'Recordarme ahorrar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Semanal' }))
    expect(screen.getByRole('switch', { name: 'Recordarme ahorrar' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByLabelText('Primer recordatorio')).toHaveValue(addDays(today, 7))
  })

  it('reminders work without any amount: weekly on a chosen weekday, first date following it', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Semanal' }))
    await user.click(screen.getByRole('button', { name: 'viernes' }))
    const expected = nextWeekday(4, addDays(today, 1))
    expect(screen.getByLabelText('Primer recordatorio')).toHaveValue(expected)
    expect(screen.getByText('Todos los viernes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear meta' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]?.[0].input).toMatchObject({
      frequency: 'weekly',
      remind: true,
      firstReminderOn: expected,
      suggestedCents: null,
    })
  })

  it('every 15 days and monthly: "el día 5 de cada mes" follows the chosen day', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cada 15 días' }))
    expect(screen.getByRole('group', { name: 'Día de la semana' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mensual' }))
    const day = screen.getByLabelText('Día del mes')
    await user.clear(day)
    await user.type(day, '5')
    expect(screen.getByText('El día 5 de cada mes')).toBeInTheDocument()
    expect(
      String(screen.getByLabelText<HTMLInputElement>('Primer recordatorio').value).slice(8),
    ).toBe('05')
  })

  it('reminders can be switched off and then nothing is sent', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Mensual' }))
    await user.click(screen.getByRole('switch', { name: 'Recordarme ahorrar' }))
    expect(screen.queryByLabelText('Primer recordatorio')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Crear meta' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]?.[0].input).toMatchObject({
      frequency: 'monthly',
      remind: false,
      firstReminderOn: null,
    })
  })

  it('a double tap creates once', async () => {
    const { user } = setup()
    await fillBasics(user)
    await user.dblClick(screen.getByRole('button', { name: 'Crear meta' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('shows what the server says when the account lacks free money', async () => {
    create.mockRejectedValueOnce({ message: 'not_enough_free_money' })
    const { user } = setup()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Crear meta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No alcanza el dinero libre')
  })

  it('starts from what the installments calculator hands over', () => {
    setup({ prefill: { name: 'Notebook', amountCents: 900_000_00, months: 6 } })
    expect(screen.getByLabelText('Nombre')).toHaveValue('Notebook')
    expect(screen.getByLabelText('Monto objetivo')).toHaveValue('900.000')
    expect(screen.getByRole('button', { name: '6 meses' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('editing starts from the saved values, hides the initial amount and keeps the reminder schedule', async () => {
    const goal = makeGoal({
      name: 'Auto',
      icon: 'auto',
      targetCents: 1_000_000_00,
      frequency: 'monthly',
      remind: true,
      suggestedCents: 50_000_00,
      anchorOn: addDays(today, 10),
      nextReminderOn: addDays(today, 10),
      reminderOn: addDays(today, 10),
    })
    const { user } = setup({ goal })
    expect(screen.getByLabelText('Monto objetivo')).toHaveValue('1.000.000')
    expect(screen.getByLabelText('Importe orientativo')).toHaveValue('50.000')
    expect(screen.getByLabelText('Primer recordatorio')).toHaveValue(addDays(today, 10))
    expect(screen.queryByLabelText('Monto inicial reservado')).toBeNull()
    const target = screen.getByLabelText('Monto objetivo')
    await user.clear(target)
    await user.type(target, '1200000')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      id: 'g1',
      input: {
        targetCents: 1_200_000_00,
        remind: true,
        firstReminderOn: addDays(today, 10),
        accountId: 'galicia',
      },
    })
  })

  it('without any usable account it explains what to do', () => {
    overview.current = makeSavings({ accounts: [] })
    render(
      <MemoryRouter>
        <ToastProvider>
          <SavingsGoalFormSheet onClose={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Necesitás una cuenta de efectivo, banco o billetera',
    )
  })
})
