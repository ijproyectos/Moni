import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeAccount } from '@/features/accounts/domain/testing'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Person } from '../domain/ledger'
import { SettleUpSheet } from './SettleUpSheet'

const ME = 'u-ana'
const BETO = 'u-beto'
const FRAN = 'guest-fran'

const state = vi.hoisted(() => ({
  accounts: [] as unknown[],
  createReal: vi.fn(),
  createGuest: vi.fn(),
}))

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: state.accounts }),
}))
vi.mock('../api/useGroups', () => ({
  useCreateSettlement: () => ({ mutateAsync: state.createReal, isPending: false }),
}))
vi.mock('../api/useGroupGuests', () => ({
  useCreateGuestSettlement: () => ({ mutateAsync: state.createGuest, isPending: false }),
}))

const people: Person[] = [
  { id: ME, name: 'Vos', hasMoni: true, isMe: true },
  { id: BETO, name: 'Beto', hasMoni: true, isMe: false },
  { id: FRAN, name: 'Fran', hasMoni: false, isMe: false },
]

function setup(transfers: { fromUserId: string; toUserId: string; amountCents: number }[]) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <SettleUpSheet
        groupId="g1"
        meId={ME}
        people={people}
        transfers={transfers}
        onClose={onClose}
      />
    </ToastProvider>,
  )
  return { user: userEvent.setup(), onClose }
}

beforeEach(() => {
  state.createReal.mockReset().mockResolvedValue('s1')
  state.createGuest.mockReset().mockResolvedValue('s2')
  state.accounts = [
    makeAccount({ id: 'gal', name: 'Galicia', kind: 'bank' }),
    makeAccount({ id: 'efe', name: 'Efectivo', kind: 'cash' }),
    makeAccount({ id: 'visa', name: 'Visa', kind: 'credit_card' }),
    makeAccount({ id: 'old', name: 'Vieja', kind: 'bank', archivedAt: '2026-01-01T00:00:00Z' }),
  ]
})

describe('Saldar cuentas: pagos con personas sin cuenta', () => {
  it('when a person without an account pays me, I can choose where I received it (optional)', async () => {
    const { user } = setup([{ fromUserId: FRAN, toUserId: ME, amountCents: 10_000_00 }])
    const select = screen.getByRole('combobox', { name: /¿En qué cuenta lo recibiste\?/ })
    expect(select).toHaveValue('')
    expect(
      screen.getByRole('option', { name: /Sin cuenta: solo saldar la deuda/ }),
    ).toBeInTheDocument()
    // Only my usable accounts: no cards, no archived ones.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sin cuenta: solo saldar la deuda',
      'Galicia',
      'Efectivo',
    ])
    await user.selectOptions(select, 'gal')
    await user.click(screen.getByRole('button', { name: 'Marcar como saldado' }))
    await waitFor(() => expect(state.createGuest).toHaveBeenCalledTimes(1))
    expect(state.createGuest.mock.calls[0]?.[0]).toMatchObject({
      groupId: 'g1',
      settlement: { fromId: FRAN, toId: ME, cents: 10_000_00, accountId: 'gal' },
    })
    expect(state.createReal).not.toHaveBeenCalled()
  })

  it('without choosing an account it only records the debt settlement', async () => {
    const { user } = setup([{ fromUserId: FRAN, toUserId: ME, amountCents: 10_000_00 }])
    await user.click(screen.getByRole('button', { name: 'Marcar como saldado' }))
    await waitFor(() => expect(state.createGuest).toHaveBeenCalledTimes(1))
    expect(state.createGuest.mock.calls[0]?.[0].settlement.accountId).toBeNull()
  })

  it('says the account is credited only when one is chosen', async () => {
    const { user } = setup([{ fromUserId: FRAN, toUserId: ME, amountCents: 10_000_00 }])
    expect(screen.getByText(/queda como un pago entre ustedes\. No cuenta/)).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox'), 'efe')
    expect(screen.getByText(/se suma a tu cuenta/)).toBeInTheDocument()
  })

  it('when I pay a person without an account, the account is where it was paid from', async () => {
    const { user } = setup([{ fromUserId: ME, toUserId: FRAN, amountCents: 5_000_00 }])
    await user.selectOptions(
      screen.getByRole('combobox', { name: /¿Desde qué cuenta lo pagaste\?/ }),
      'gal',
    )
    await user.click(screen.getByRole('button', { name: 'Marcar como saldado' }))
    await waitFor(() => expect(state.createGuest).toHaveBeenCalled())
    expect(state.createGuest.mock.calls[0]?.[0].settlement).toMatchObject({
      fromId: ME,
      toId: FRAN,
      accountId: 'gal',
    })
  })

  it('a payment I make to a member already moves my account through the shared settlement: no extra picker', async () => {
    setup([{ fromUserId: ME, toUserId: BETO, amountCents: 5_000_00 }])
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('the picker is not offered for payments between other people', () => {
    setup([{ fromUserId: BETO, toUserId: FRAN, amountCents: 5_000_00 }])
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('changing which payment is being settled clears the chosen account', async () => {
    const { user } = setup([
      { fromUserId: FRAN, toUserId: ME, amountCents: 10_000_00 },
      { fromUserId: BETO, toUserId: ME, amountCents: 3_000_00 },
    ])
    await user.selectOptions(screen.getByRole('combobox'), 'gal')
    await user.click(screen.getByRole('button', { name: /Beto → Vos/ }))
    await user.click(screen.getByRole('button', { name: /Fran → Vos/ }))
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
