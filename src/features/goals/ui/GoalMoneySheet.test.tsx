import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeGoal, makeSavingsAccount } from '../domain/testing'
import { GoalMoneySheet } from './GoalMoneySheet'

const deposit = vi.hoisted(() => vi.fn().mockResolvedValue('m'))
const withdraw = vi.hoisted(() => vi.fn().mockResolvedValue('m'))
vi.mock('../api/useSavings', () => ({
  useAddDeposit: () => ({ mutateAsync: deposit, isPending: false }),
  useWithdrawReserve: () => ({ mutateAsync: withdraw, isPending: false }),
}))

function setup(mode: 'deposit' | 'withdraw', goal = makeGoal(), account = makeSavingsAccount()) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <GoalMoneySheet goal={goal} account={account} mode={mode} onClose={onClose} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('GoalMoneySheet', () => {
  beforeEach(() => [deposit, withdraw].forEach((f) => f.mockClear()))

  it('reserves an amount and says it is not an expense', async () => {
    const { user, onClose } = setup('deposit')
    expect(screen.getByText(/Libre en Galicia:/)).toHaveTextContent('$120.000')
    expect(screen.getByText(/reservar no es un gasto/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Monto a reservar'), '10000')
    await user.click(screen.getByRole('button', { name: /^Reservar/ }))
    await waitFor(() => expect(deposit).toHaveBeenCalledTimes(1))
    const call = deposit.mock.calls[0]?.[0]
    expect(call).toMatchObject({ goalId: 'g1', amountCents: 10_000_00 })
    expect(call.requestKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('starts from the suggested amount when there is one, and works without it', () => {
    setup('deposit', makeGoal({ suggestedCents: 30_000_00 }))
    expect(screen.getByLabelText('Monto a reservar')).toHaveValue('30.000')
  })

  it('works with no suggested amount: starts empty and the button waits for an amount', () => {
    setup('deposit')
    expect(screen.getByLabelText('Monto a reservar')).toHaveValue('')
    expect(screen.getByRole('button', { name: /^Reservar/ })).toBeDisabled()
  })

  it('more than the free money: shows the free amount and corrects the importe with one tap', async () => {
    const { user } = setup('deposit', makeGoal(), makeSavingsAccount({ freeCents: 20_000_00 }))
    await user.type(screen.getByLabelText('Monto a reservar'), '50000')
    expect(screen.getByRole('alert')).toHaveTextContent('te quedan $20.000 libres')
    expect(screen.getByRole('button', { name: /^Reservar/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Usar $20.000' }))
    expect(screen.getByLabelText('Monto a reservar')).toHaveValue('20.000')
    expect(screen.getByRole('button', { name: /^Reservar/ })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^Reservar/ }))
    await waitFor(() =>
      expect(deposit).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 20_000_00 })),
    )
  })

  it('an account with no free money says so and offers nothing to use', async () => {
    const { user } = setup('deposit', makeGoal(), makeSavingsAccount({ freeCents: -10_000_00 }))
    await user.type(screen.getByLabelText('Monto a reservar'), '100')
    expect(screen.getByRole('alert')).toHaveTextContent('no tiene dinero libre')
    expect(screen.queryByRole('button', { name: /^Usar/ })).toBeNull()
  })

  it('a double tap reserves once', async () => {
    const { user } = setup('deposit')
    await user.type(screen.getByLabelText('Monto a reservar'), '1000')
    await user.dblClick(screen.getByRole('button', { name: /^Reservar/ }))
    await waitFor(() => expect(deposit).toHaveBeenCalled())
    expect(deposit).toHaveBeenCalledTimes(1)
  })

  it('a goal whose account is no longer available cannot take money', () => {
    setup('deposit', makeGoal({ accountUsable: false }))
    expect(screen.getByRole('alert')).toHaveTextContent('ya no está disponible')
    expect(screen.getByRole('button', { name: /^Reservar/ })).toBeDisabled()
  })

  it('shows a server error in plain words and lets the person retry', async () => {
    deposit.mockRejectedValueOnce({ message: 'not_enough_free_money' })
    const { user } = setup('deposit')
    await user.type(screen.getByLabelText('Monto a reservar'), '1000')
    await user.click(screen.getByRole('button', { name: /^Reservar/ }))
    expect(await screen.findByText(/No alcanza el dinero libre/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Reservar/ }))
    await waitFor(() => expect(deposit).toHaveBeenCalledTimes(2))
  })

  it('withdraws up to what the goal has and explains that no money moves', async () => {
    const { user } = setup('withdraw', makeGoal({ reservedCents: 30_000_00 }))
    expect(screen.getByText(/Reservado en esta meta:/)).toHaveTextContent('$30.000')
    expect(screen.getByText(/retirar solo libera la reserva/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Monto a liberar'), '40000')
    expect(screen.getByRole('alert')).toHaveTextContent('reservados $30.000')
    await user.click(screen.getByRole('button', { name: 'Usar $30.000' }))
    await user.click(screen.getByRole('button', { name: /^Retirar/ }))
    await waitFor(() =>
      expect(withdraw).toHaveBeenCalledWith(
        expect.objectContaining({ goalId: 'g1', amountCents: 30_000_00 }),
      ),
    )
    expect(deposit).not.toHaveBeenCalled()
  })
})
