import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Notice, PaymentReport } from '../domain/debts'
import { GroupNoticesPage } from './GroupNoticesPage'

const state = vi.hoisted(() => ({
  notices: { data: [] as unknown[], isLoading: false, isError: false },
  reports: { data: [] as unknown[] },
  markRead: vi.fn(),
  report: vi.fn(),
  confirm: vi.fn(),
  reject: vi.fn(),
  removed: new Set<string>(),
  remove: vi.fn(),
}))
vi.mock('@/features/notifications/ui/useNoticeDeletion', () => ({
  useNoticeDeletion: () => ({ removed: state.removed, remove: state.remove, isRemoving: false }),
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: [], isLoading: false }),
}))
const joinAnswer = vi.hoisted(() => ({
  approve: vi.fn().mockResolvedValue('g1'),
  reject: vi.fn().mockResolvedValue(undefined),
  respond: vi.fn().mockResolvedValue('g1'),
}))
vi.mock('@/features/groups/api/useGroups', () => ({
  useApproveJoinRequest: () => ({ mutateAsync: joinAnswer.approve, isPending: false }),
  useRejectJoinRequest: () => ({ mutateAsync: joinAnswer.reject, isPending: false }),
  useRespondInvitation: () => ({ mutateAsync: joinAnswer.respond, isPending: false }),
}))
vi.mock('../api/useDebts', () => ({
  useNotices: () => state.notices,
  usePaymentReports: () => state.reports,
  useMarkNoticesRead: () => ({ mutate: state.markRead }),
  useReportPayment: () => ({ mutateAsync: state.report, isPending: false }),
  useConfirmPayment: () => ({ mutateAsync: state.confirm, isPending: false }),
  useRejectPayment: () => ({ mutateAsync: state.reject, isPending: false }),
}))

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n1',
  kind: 'debt_reminder',
  groupId: 'g1',
  groupName: 'Casa',
  actorId: 'ana',
  actorName: 'Ana',
  amountCents: 30_000_00,
  reportId: null,
  transferLabel: null,
  transferAlias: null,
  transferCbu: null,
  createdAt: '2026-10-30T10:00:00Z',
  readAt: null,
  ...over,
})

function renderPage() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <GroupNoticesPage />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.notices = { data: [], isLoading: false, isError: false }
  state.reports = { data: [] }
  for (const fn of [state.markRead, state.report, state.confirm, state.reject]) fn.mockReset()
  state.report.mockResolvedValue(undefined)
  state.confirm.mockResolvedValue(true)
  state.reject.mockResolvedValue(undefined)
})

describe('Avisos de grupos', () => {
  it('has a friendly empty state', () => {
    renderPage()
    expect(screen.getByText('No tenés avisos')).toBeVisible()
  })

  it('a reminder says who asks, how much and which group, and opens the group', () => {
    state.notices = { data: [notice()], isLoading: false, isError: false }
    renderPage()
    expect(screen.getByText('Ana te recordó que tenés un pago pendiente de $30.000.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Abrir el grupo' })).toHaveAttribute(
      'href',
      '/grupos/g1',
    )
  })

  it('shows the account the sender chose to share, with copy buttons, and nothing else', () => {
    state.notices = {
      data: [
        notice({
          transferLabel: 'Galicia',
          transferAlias: 'ana.galicia',
          transferCbu: '0070000030000012345678',
        }),
      ],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(screen.getByText('Podés transferir a Galicia:')).toBeVisible()
    expect(screen.getByText('Alias: ana.galicia')).toBeVisible()
    expect(screen.getByText('CBU/CVU: 0070000030000012345678')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copiar Alias' })).toBeVisible()
  })

  it('a reminder without transfer data shows no transfer block', () => {
    state.notices = { data: [notice()], isLoading: false, isError: false }
    renderPage()
    expect(screen.queryByText(/Podés transferir/)).toBeNull()
  })

  it('marks what is unread as read when it opens', () => {
    state.notices = {
      data: [notice(), notice({ id: 'n2', readAt: '2026-10-30T11:00:00Z' })],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(state.markRead).toHaveBeenCalled()
  })

  it('tells unread notices apart and keeps every card on theme tokens (no fixed white)', () => {
    state.notices = {
      data: [notice(), notice({ id: 'n2', readAt: '2026-10-30T11:00:00Z' })],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(screen.getAllByText('Nuevo')).toHaveLength(1)
    expect(document.body.innerHTML).not.toMatch(/bg-white/)
  })

  it('does not ask to mark anything when everything was read', () => {
    state.notices = {
      data: [notice({ readAt: '2026-10-30T11:00:00Z' })],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(state.markRead).not.toHaveBeenCalled()
  })

  it('"Ya pagué" from a reminder asks first, then reports the payment to who asked', async () => {
    state.notices = { data: [notice()], isLoading: false, isError: false }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Ya pagué' }))
    expect(state.report).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Avisar sin elegir cuenta' }))
    expect(state.report).toHaveBeenCalledWith({
      groupId: 'g1',
      creditorId: 'ana',
      amountCents: 30_000_00,
      accountId: null,
    })
  })

  it('a reported payment can be confirmed or refused while it is still open', async () => {
    const report: PaymentReport = {
      id: 'r1',
      groupId: 'g1',
      fromUserId: 'ana',
      toUserId: 'me',
      amountCents: 30_000_00,
      status: 'reported',
      reportedAt: '2026-10-30T10:00:00Z',
      resolvedAt: null,
    }
    state.notices = {
      data: [notice({ kind: 'payment_reported', reportId: 'r1' })],
      isLoading: false,
      isError: false,
    }
    state.reports = { data: [report] }
    const user = renderPage()
    expect(screen.getByText(/Ana indicó que te pagó \$30\.000/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    // Nothing is credited yet: the receiver must choose an account (there is no way to skip it).
    expect(state.confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /sin registrar/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirmar y registrar' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'No lo recibí' }))
    expect(state.reject).toHaveBeenCalledWith('r1')
  })

  it('once the payment was resolved there is nothing left to confirm (no duplicate confirmation)', () => {
    state.notices = {
      data: [notice({ kind: 'payment_reported', reportId: 'r1' })],
      isLoading: false,
      isError: false,
    }
    state.reports = { data: [{ id: 'r1', status: 'confirmed' }] }
    renderPage()
    expect(screen.queryByRole('button', { name: 'Confirmar recepción' })).toBeNull()
    expect(
      within(screen.getByRole('listitem')).getByRole('link', { name: 'Abrir el grupo' }),
    ).toBeVisible()
  })

  it('tells the payer when it was confirmed or not received', () => {
    state.notices = {
      data: [
        notice({ id: 'a', kind: 'payment_confirmed' }),
        notice({ id: 'b', kind: 'payment_rejected' }),
      ],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(screen.getByText(/Ana confirmó tu pago de/)).toBeVisible()
    expect(screen.getByText(/todavía no confirmó tu pago/)).toBeVisible()
  })
})

describe('Avisos de grupos: solicitudes de ingreso', () => {
  beforeEach(() => {
    joinAnswer.approve.mockClear()
    joinAnswer.reject.mockClear()
  })

  it('an administrator can accept or refuse a request right from the notice', async () => {
    state.notices = {
      data: [notice({ id: 'j1', kind: 'join_request', actorName: 'Dani', groupName: 'Hogar', amountCents: 0, requestId: 'req-1' })],
      isLoading: false,
      isError: false,
    }
    const user = renderPage()
    expect(screen.getByText('Dani quiere entrar al grupo Hogar.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Aceptar/ }))
    expect(joinAnswer.approve).toHaveBeenCalledWith('req-1')
    await user.click(screen.getByRole('button', { name: 'No aceptar' }))
    expect(joinAnswer.reject).toHaveBeenCalledWith('req-1')
  })

  it('tells the person their request was accepted (and opens the group) or refused (and offers nothing of the group)', () => {
    state.notices = {
      data: [
        notice({ id: 'a', kind: 'join_approved', actorName: 'Ana', groupName: 'Hogar', amountCents: 0 }),
        notice({ id: 'r', kind: 'join_rejected', actorName: 'Ana', groupName: 'Viaje', amountCents: 0 }),
      ],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(screen.getByText('Ana te aceptó en el grupo Hogar. Ya podés verlo.')).toBeVisible()
    expect(screen.getByText('Tu solicitud para entrar al grupo Viaje no fue aceptada.')).toBeVisible()
    // Only the accepted one links to the group: the refused person has no access to it.
    expect(screen.getAllByRole('link', { name: /Abrir el grupo/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Aceptar/ })).toBeNull()
  })
})

describe('Avisos de grupos: invitaciones directas', () => {
  it('the invited person accepts or declines from the notice; nothing of the group is offered before', async () => {
    joinAnswer.respond.mockClear()
    state.notices = {
      data: [notice({ id: 'i1', kind: 'group_invitation', actorName: 'Ana', groupName: 'Hogar', amountCents: 0, invitationId: 'inv-1' })],
      isLoading: false,
      isError: false,
    }
    const user = renderPage()
    expect(screen.getByText('Ana te invitó al grupo Hogar.')).toBeVisible()
    expect(screen.queryByRole('link', { name: /Abrir el grupo/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Aceptar/ }))
    expect(joinAnswer.respond).toHaveBeenCalledWith({ invitationId: 'inv-1', accept: true })
    await user.click(screen.getByRole('button', { name: 'No, gracias' }))
    expect(joinAnswer.respond).toHaveBeenCalledWith({ invitationId: 'inv-1', accept: false })
  })

  it('the administrator is told when it was accepted and can open the group', () => {
    state.notices = {
      data: [notice({ id: 'i2', kind: 'invitation_accepted', actorName: 'Beto', groupName: 'Hogar', amountCents: 0 })],
      isLoading: false,
      isError: false,
    }
    renderPage()
    expect(screen.getByText('Beto aceptó tu invitación al grupo Hogar.')).toBeVisible()
    expect(screen.getByRole('link', { name: /Abrir el grupo/ })).toBeInTheDocument()
  })
})

describe('Avisos de grupos: pagos por confirmar y enlace desde el push', () => {
  const report = (over: Record<string, unknown> = {}) => ({
    id: 'rep-1', groupId: 'g1', fromUserId: 'ana', toUserId: 'me', amountCents: 15_000_00, status: 'reported',
    reportedAt: '2026-11-21T10:00:00Z', resolvedAt: null, ...over,
  })

  it('tells the creditor how many payments wait for their confirmation', () => {
    state.notices = { data: [notice({ id: 'p1', kind: 'payment_reported', reportId: 'rep-1' })], isLoading: false, isError: false }
    state.reports = { data: [report()] }
    renderPage()
    expect(screen.getByText('Tenés un pago pendiente de confirmar')).toBeVisible()
    state.reports = { data: [] }
  })

  it('does not say that something is pending once it was answered or when the payment was made by me', () => {
    state.notices = { data: [notice({ id: 'p1', kind: 'payment_reported', reportId: 'rep-1' })], isLoading: false, isError: false }
    state.reports = { data: [report({ status: 'confirmed' }), report({ id: 'rep-2', fromUserId: 'me', toUserId: 'ana' })] }
    renderPage()
    expect(screen.queryByText(/pendiente de confirmar|pendientes de confirmar/)).toBeNull()
    state.reports = { data: [] }
  })

  it('a push opens the tray on its notice (?aviso=<id>): it is highlighted and the group is shown on the card', () => {
    state.notices = {
      data: [notice({ id: 'a', groupName: 'Hogar' }), notice({ id: 'b', kind: 'payment_reported', groupName: 'Viaje' })],
      isLoading: false,
      isError: false,
    }
    render(
      <MemoryRouter initialEntries={['/grupos/avisos?aviso=b']}>
        <ToastProvider>
          <GroupNoticesPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(document.getElementById('aviso-b')).toHaveClass('ring-2')
    expect(document.getElementById('aviso-a')).not.toHaveClass('ring-2')
    expect(screen.getByText('Grupo: Viaje')).toBeInTheDocument()
  })
})
