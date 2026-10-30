import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import type { SavingsGoal } from '../domain/savings'
import { makeGoal, makeMovement, makeSavings, makeSavingsAccount } from '../domain/testing'
import { SavingsGoalDetail } from './SavingsGoalDetail'

const setStatus = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const voidMovement = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const withdraw = vi.hoisted(() => vi.fn().mockResolvedValue('m'))
vi.mock('../api/useSavings', () => ({
  useSetGoalStatus: () => ({ mutateAsync: setStatus, isPending: false }),
  useVoidMovement: () => ({ mutateAsync: voidMovement, isPending: false }),
  useWithdrawReserve: () => ({ mutateAsync: withdraw, isPending: false }),
  useAddDeposit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSnoozeReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSavings: () => ({ isLoading: false, data: makeSavings({ accounts: [makeSavingsAccount()] }) }),
  useCreateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function setup(over: Partial<SavingsGoal> = {}, accountOver = {}) {
  const goal = makeGoal(over)
  const overview = makeSavings({
    goals: [goal],
    accounts: [makeSavingsAccount(accountOver)],
    movements: [
      makeMovement({ id: 'd1', kind: 'deposit', amountCents: 40_000_00, occurredOn: '2026-11-03' }),
      makeMovement({
        id: 'w1',
        kind: 'withdrawal',
        amountCents: 10_000_00,
        occurredOn: '2026-11-05',
      }),
      makeMovement({
        id: 'x1',
        kind: 'deposit',
        amountCents: 9_000_00,
        occurredOn: '2026-11-06',
        status: 'voided',
      }),
    ],
  })
  render(
    <MemoryRouter>
      <ToastProvider>
        <SavingsGoalDetail goal={goal} overview={overview} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('SavingsGoalDetail', () => {
  beforeEach(() => [setStatus, voidMovement, withdraw].forEach((f) => f.mockClear()))

  it('shows the reserved money, the account with its real balance, reserved and free, and the history', () => {
    setup()
    expect(screen.getByText('$30.000', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Saldo real \$150\.000/)).toHaveTextContent(
      'reservado para metas $30.000',
    )
    expect(screen.getByText(/libre \$120\.000/)).toBeInTheDocument()
    expect(screen.getByText('Historial')).toBeInTheDocument()
    expect(screen.getByText('+$40.000')).toBeInTheDocument()
    expect(screen.getByText('-$10.000')).toBeInTheDocument()
    expect(screen.getByText(/anulado/)).toBeInTheDocument()
    expect(
      screen.getByText(/no es un gasto ni un ingreso y no cambia el saldo/),
    ).toBeInTheDocument()
  })

  it('a goal beyond 100 % shows the excess without breaking', () => {
    setup({ reservedCents: 780_000_00, targetCents: 600_000_00 })
    expect(screen.getByText(/130% reservado/)).toBeInTheDocument()
    expect(screen.getByText('Superaste la meta por $180.000')).toBeInTheDocument()
  })

  it('warns when the account no longer covers the reserves, naming the goal', () => {
    setup({}, { balanceCents: 20_000_00, reservedCents: 30_000_00, freeCents: -10_000_00 })
    expect(
      screen.getByRole('region', { name: /Ahorros comprometidos en Galicia/ }),
    ).toHaveTextContent('Te faltan $10.000 para cubrirlos')
  })

  it('opens the sheets to add and to withdraw (withdrawing needs something reserved)', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar dinero' }))
    expect(screen.getByRole('dialog', { name: 'Agregar a la meta' })).toBeInTheDocument()
  })

  it('cannot withdraw from an empty goal', () => {
    setup({ reservedCents: 0 })
    expect(screen.getByRole('button', { name: 'Retirar' })).toBeDisabled()
  })

  it('pauses the goal and says it keeps its reserve', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'g1', status: 'paused', release: false })
  })

  it('completing a goal with money offers to keep it reserved or to release it; the sheet itself never decides', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Marcar como completada' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Tiene $30.000 reservados')
    expect(setStatus).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Completar y mantener reservado' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'g1', status: 'completed', release: false })
  })

  it('completing and releasing frees the money in the same step', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Marcar como completada' }))
    await user.click(screen.getByRole('button', { name: 'Completar y liberar $30.000' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'g1', status: 'completed', release: true })
  })

  it('dismissing the completion sheet changes nothing', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Marcar como completada' }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('a completed goal keeps its reserve until the person releases it', async () => {
    const user = setup({ status: 'completed' })
    expect(screen.getByText('Meta completada')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Liberar los $30.000 reservados' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('No se mueve plata')
    await user.click(screen.getByRole('button', { name: 'Liberar' }))
    expect(withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'g1', amountCents: 30_000_00 }),
    )
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('archiving with money asks to release it: nothing stays reserved out of sight', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Archivar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'una meta archivada no deja plata apartada',
    )
    expect(setStatus).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Liberar $30.000 y archivar' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'g1', status: 'archived', release: true })
  })

  it('archiving an empty goal needs no release question', async () => {
    const user = setup({ reservedCents: 0 })
    await user.click(screen.getByRole('button', { name: 'Archivar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Conservás todo el historial')
    await user.click(screen.getAllByRole('button', { name: 'Archivar' }).at(-1) as HTMLElement)
    expect(setStatus).toHaveBeenCalledWith({ id: 'g1', status: 'archived', release: true })
  })

  it('a paused or archived goal can be reactivated', async () => {
    const user = setup({ status: 'paused' })
    await user.click(screen.getByRole('button', { name: 'Reactivar' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'g1', status: 'active', release: false })
  })

  it('an archived goal offers no money actions and no editing, only reactivating', () => {
    setup({ status: 'archived', reservedCents: 0 })
    expect(screen.queryByRole('button', { name: 'Agregar dinero' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar meta' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Anular/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
  })

  it('voiding a movement asks first and explains the effect', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Anular aporte de $40.000' }))
    expect(screen.getByText('¿Anular este movimiento?')).toBeInTheDocument()
    expect(screen.getByText(/baja lo reservado/)).toBeInTheDocument()
    expect(voidMovement).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Anular' }))
    expect(voidMovement).toHaveBeenCalledWith('d1')
  })

  it('shows the reminder schedule in words', () => {
    setup({
      frequency: 'monthly',
      remind: true,
      anchorOn: '2026-12-05',
      reminderOn: '2026-12-05',
      nextReminderOn: '2026-12-05',
    })
    expect(screen.getByText(/El día 5 de cada mes/)).toBeInTheDocument()
  })

  it('a goal on an account that is no longer available says so and points to editing', () => {
    setup({ accountUsable: false })
    expect(screen.getAllByText(/no disponible|ya no está disponible/).length).toBeGreaterThan(0)
  })
})
