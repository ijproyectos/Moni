import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '../domain/account'
import { makeAccount } from '../domain/testing'
import { AdjustBalanceSection } from './AdjustBalanceSection'

const mutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(0))
vi.mock('../api/useAccounts', () => ({
  useAdjustAccountBalance: () => ({ mutateAsync, isPending: false }),
}))

const base: Account = makeAccount({ id: 'a1', balanceCents: 6_000_00 })

async function setup(account: Account, typed: string) {
  const onDone = vi.fn()
  const user = userEvent.setup()
  render(<AdjustBalanceSection account={account} onDone={onDone} />)
  const input = screen.getByRole('textbox')
  await user.clear(input)
  await user.type(input, typed)
  await user.click(screen.getByRole('button', { name: /Ajustar/ }))
  return { onDone }
}

describe('AdjustBalanceSection', () => {
  beforeEach(() => mutateAsync.mockClear())

  it('sets an account to the typed real balance', async () => {
    const { onDone } = await setup(base, '20.000')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'a1', targetCents: 20_000_00 })
  })

  it('does not call the server when the balance already matches', async () => {
    await setup(base, '6.000')
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese ya es el saldo actual')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('rejects text that is not an amount', async () => {
    await setup(base, 'mucho')
    expect(await screen.findByRole('alert')).toHaveTextContent('monto válido')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('a card is adjusted by its debt: typed 50.000 becomes a balance of -50.000', async () => {
    const card: Account = { ...base, id: 'c1', kind: 'credit_card', balanceCents: -12_000_00 }
    render(<AdjustBalanceSection account={card} onDone={vi.fn()} />)
    expect(screen.getByText(/Hoy figura una deuda de/)).toHaveTextContent('$12.000')
    const user = userEvent.setup()
    const input = screen.getByLabelText('Deuda real')
    await user.clear(input)
    await user.type(input, '50000')
    await user.click(screen.getByRole('button', { name: 'Ajustar deuda' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ id: 'c1', targetCents: -50_000_00 }),
    )
  })
})
