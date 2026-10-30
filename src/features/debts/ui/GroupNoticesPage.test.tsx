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
    expect(screen.getByText('Ana te recuerda que le debés $30.000 del grupo Casa.')).toBeVisible()
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
    await user.click(screen.getByRole('button', { name: 'Sí, ya pagué' }))
    expect(state.report).toHaveBeenCalledWith({
      groupId: 'g1',
      creditorId: 'ana',
      amountCents: 30_000_00,
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
    expect(screen.getByText(/Ana informó que te pagó \$30\.000/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    expect(state.confirm).toHaveBeenCalledWith('r1')
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
    expect(screen.getByText(/Ana confirmó que recibió tu pago/)).toBeVisible()
    expect(screen.getByText(/todavía no recibió tu pago/)).toBeVisible()
  })
})
