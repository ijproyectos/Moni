import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GroupMember, MemberBalance } from '../domain/group'
import { suggestTransfers } from '../domain/groupView'
import { BalancesPanel } from './BalancesPanel'
import { MembersPanel } from './MembersPanel'
import { SettleForm } from './SettleForm'

const ME = '00000000-0000-4000-8000-00000000000a'
const ANA = '00000000-0000-4000-8000-00000000000b'

const balance = (userId: string, name: string, netCents: number): MemberBalance => ({
  userId,
  displayName: name,
  paidCents: 0,
  owedCents: 0,
  settledOutCents: 0,
  settledInCents: 0,
  netCents,
})
const member = (userId: string, displayName: string, role: 'owner' | 'member'): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role,
  joinedAt: '2026-10-01T00:00:00Z',
  leftAt: null,
})
const members = [member(ME, 'Beto', 'member'), member(ANA, 'Ana', 'owner')]
const balances = [balance(ME, 'Beto', -3333), balance(ANA, 'Ana', 3333)]

describe('BalancesPanel', () => {
  it('shows a Saldar button only on transfers where I am the debtor and passes the suggestion', async () => {
    const onSettle = vi.fn()
    render(
      <BalancesPanel
        balances={balances}
        members={members}
        transfers={suggestTransfers(balances)}
        settlements={[]}
        meId={ME}
        onSettle={onSettle}
        onVoidSettlement={vi.fn()}
        onRecordReceipt={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Saldar' }))
    expect(onSettle).toHaveBeenCalledWith({ fromUserId: ME, toUserId: ANA, amountCents: 3333 })
  })

  it('does not offer Saldar to the creditor', () => {
    render(
      <BalancesPanel
        balances={balances}
        members={members}
        transfers={suggestTransfers(balances)}
        settlements={[]}
        meId={ANA}
        onSettle={vi.fn()}
        onVoidSettlement={vi.fn()}
        onRecordReceipt={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Saldar' })).not.toBeInTheDocument()
  })
})

describe('SettleForm', () => {
  it('prefills the suggested amount and submits cents', async () => {
    const onSubmit = vi.fn()
    render(
      <SettleForm
        recipients={members.filter((m) => m.userId === ANA)}
        accounts={[]}
        initialToUser={ANA}
        initialAmountCents={3333}
        isSubmitting={false}
        submitError={null}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByLabelText('Monto')).toHaveValue('33,33')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      toUser: ANA,
      amount: 3333,
      note: null,
      accountId: null,
    })
  })
})

describe('MembersPanel leave', () => {
  const props = {
    members,
    invites: [],
    invitesFailed: false,
    meId: ME,
    isInviting: false,
    inviteError: null,
    onInvite: vi.fn(),
    onShowInvite: vi.fn(),
    onRevokeInvite: vi.fn(),
  }

  it('disables leaving while the balance is not zero and explains why', () => {
    render(<MembersPanel {...props} myNetCents={-3333} onLeave={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Salir del grupo' })).toBeDisabled()
    expect(screen.getByText(/Todavía debés plata/)).toBeInTheDocument()
    expect(screen.getByText('Dueño')).toBeInTheDocument()
  })

  it('enables leaving at zero', async () => {
    const onLeave = vi.fn()
    render(<MembersPanel {...props} myNetCents={0} onLeave={onLeave} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salir del grupo' }))
    expect(onLeave).toHaveBeenCalled()
  })
})
