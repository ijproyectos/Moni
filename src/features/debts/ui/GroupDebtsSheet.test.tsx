import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { makeAccount } from '@/features/accounts/domain/testing'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Notice, PaymentReport, PendingDebt } from '../domain/debts'
import { GroupDebtsSheet } from './GroupDebtsSheet'

const state = vi.hoisted(() => ({
  debts: [] as unknown[],
  reports: { data: [] as unknown[], isError: false, error: null as unknown },
  notices: { data: [] as unknown[] },
  isLoading: false,
  isError: false,
  accounts: [] as unknown[],
  remind: vi.fn(),
  report: vi.fn(),
  confirm: vi.fn(),
  reject: vi.fn(),
  cancel: vi.fn(),
  saveTransfer: vi.fn(),
}))

vi.mock('../api/useDebts', () => ({
  usePendingDebts: () => ({
    debts: state.debts,
    reports: state.reports,
    isLoading: state.isLoading,
    isError: state.isError,
  }),
  useNotices: () => state.notices,
  useRemindDebt: () => ({ mutateAsync: state.remind, isPending: false }),
  useReportPayment: () => ({ mutateAsync: state.report, isPending: false }),
  useConfirmPayment: () => ({ mutateAsync: state.confirm, isPending: false }),
  useRejectPayment: () => ({ mutateAsync: state.reject, isPending: false }),
  useCancelPayment: () => ({ mutateAsync: state.cancel, isPending: false }),
}))
vi.mock('@/features/groups/api/useGroups', () => ({
  useMyGroups: () => ({ data: [{ id: 'g1', name: 'IJ' }] }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: state.accounts }),
  useUpdateTransferData: () => ({ mutateAsync: state.saveTransfer, isPending: false }),
}))

const report: PaymentReport = {
  id: 'r1',
  groupId: 'g1',
  fromUserId: 'joni',
  toUserId: 'me',
  amountCents: 10_000_00,
  status: 'reported',
  reportedAt: '2026-10-30T10:00:00Z',
  resolvedAt: null,
}
const owedByJoni: PendingDebt = {
  key: 'g1:joni:me',
  groupId: 'g1',
  groupName: 'IJ',
  direction: 'owed',
  otherUserId: 'joni',
  otherName: 'Joni Ríos',
  amountCents: 10_000_00,
  report: null,
}
const iOweAna: PendingDebt = {
  ...owedByJoni,
  key: 'g1:me:ana',
  direction: 'owe',
  otherUserId: 'ana',
  otherName: 'Ana',
  amountCents: 12_500_00,
}

function renderSheet(initialTab: 'owe' | 'owed' = 'owed') {
  render(
    <MemoryRouter>
      <ToastProvider>
        <GroupDebtsSheet initialTab={initialTab} onClose={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.debts = []
  state.reports = { data: [], isError: false, error: null }
  state.notices = { data: [] }
  state.isLoading = false
  state.isError = false
  state.accounts = [
    makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash' }),
    makeAccount({
      id: 'gal',
      name: 'Galicia',
      kind: 'bank',
      transferAlias: 'ana.galicia',
      transferCbu: '0070000030000012345678',
    }),
    makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet', transferAlias: 'ana.mp' }),
    makeAccount({ id: 'bru', name: 'Brubank', kind: 'bank' }),
  ]
  for (const fn of [
    state.remind,
    state.report,
    state.confirm,
    state.reject,
    state.cancel,
    state.saveTransfer,
  ])
    fn.mockReset()
  state.remind.mockResolvedValue(undefined)
  state.report.mockResolvedValue(undefined)
  state.confirm.mockResolvedValue(true)
  state.reject.mockResolvedValue(undefined)
  state.cancel.mockResolvedValue(undefined)
  state.saveTransfer.mockResolvedValue(undefined)
})

describe('Deudas de grupos: tabs', () => {
  it('opens on the tab of the amount that was tapped', () => {
    state.debts = [owedByJoni, iOweAna]
    const first = render(
      <MemoryRouter>
        <ToastProvider>
          <GroupDebtsSheet initialTab="owe" onClose={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Debo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Ana')).toBeVisible()
    expect(screen.queryByText('Joni Ríos')).toBeNull()
    first.unmount()
    renderSheet('owed')
    expect(screen.getByRole('button', { name: 'Me deben' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Joni Ríos')).toBeVisible()
  })

  it('has a dialog named "Deudas de grupos" and switches between "Me deben" and "Debo"', async () => {
    state.debts = [owedByJoni, iOweAna]
    const user = renderSheet('owed')
    expect(screen.getByRole('dialog', { name: 'Deudas de grupos' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Debo' }))
    expect(screen.getByText('Ana')).toBeVisible()
    expect(screen.queryByText('Joni Ríos')).toBeNull()
  })

  it('shows, for each debt, the real name, the group, the amount and its state, and a total', () => {
    state.debts = [
      owedByJoni,
      {
        ...owedByJoni,
        key: 'g2:x:me',
        groupId: 'g2',
        groupName: 'Viaje',
        otherName: 'Carla',
        amountCents: 5_000_00,
      },
    ]
    renderSheet('owed')
    const cards = screen.getAllByRole('listitem')
    expect(cards[0]).toHaveTextContent('Joni Ríos')
    expect(cards[0]).toHaveTextContent('IJ')
    expect(cards[0]).toHaveTextContent('$10.000')
    expect(cards[0]).toHaveTextContent('Pendiente')
    expect(cards[1]).toHaveTextContent('Carla')
    expect(cards[1]).toHaveTextContent('Viaje')
    expect(screen.getByText(/En total te deben/)).toHaveTextContent('$15.000 entre 2 deudas')
  })

  it('has a friendly empty state on each tab', async () => {
    const user = renderSheet('owed')
    expect(screen.getByText('Nadie te debe nada')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Debo' }))
    expect(screen.getByText('No le debés nada a nadie')).toBeVisible()
  })

  it('a debt with a reported payment says so', () => {
    state.debts = [{ ...owedByJoni, report }]
    renderSheet()
    expect(screen.getByText('Pago informado')).toBeVisible()
  })
})

describe('Me deben: Enviar cobro', () => {
  beforeEach(() => {
    state.debts = [owedByJoni]
  })

  async function openCollect() {
    const user = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Enviar cobro' }))
    return { user, sheet: screen.getByRole('dialog', { name: 'Enviar cobro' }) }
  }

  it('lists only my banks and wallets (never cash) with their real alias or CBU', async () => {
    const { sheet } = await openCollect()
    expect(within(sheet).getByRole('button', { name: /Galicia/ })).toHaveTextContent(
      'Alias: ana.galicia · CBU: 0070000030000012345678',
    )
    expect(within(sheet).getByRole('button', { name: /Mercado Pago/ })).toHaveTextContent(
      'Alias: ana.mp',
    )
    expect(within(sheet).queryByRole('button', { name: /Efectivo/ })).toBeNull()
  })

  it('shows the message and it changes by itself with the chosen account', async () => {
    const { user, sheet } = await openCollect()
    const message = within(sheet).getByLabelText('Mensaje')
    expect(message).toHaveTextContent('¡Hola, Joni! Te paso lo que quedó pendiente del grupo IJ.')
    expect(message).toHaveTextContent('Me debés $10.000.')
    expect(message).not.toHaveTextContent(/Alias|Banco:/)
    await user.click(within(sheet).getByRole('button', { name: /Galicia/ }))
    expect(message).toHaveTextContent('Podés transferirme a:')
    expect(message).toHaveTextContent('Banco: Galicia')
    expect(message).toHaveTextContent('Alias: ana.galicia')
    await user.click(within(sheet).getByRole('button', { name: /Mercado Pago/ }))
    expect(message).toHaveTextContent('Billetera: Mercado Pago')
    expect(message).toHaveTextContent('Alias: ana.mp')
    expect(message).not.toHaveTextContent('ana.galicia')
    await user.click(
      within(sheet).getByRole('button', { name: 'No incluir datos para transferir' }),
    )
    expect(message).not.toHaveTextContent(/Alias|Mercado Pago/)
  })

  it('lets me add the alias of an account without leaving the flow, and then uses it', async () => {
    const { user, sheet } = await openCollect()
    await user.click(within(sheet).getByRole('button', { name: /Brubank/ }))
    await user.type(within(sheet).getByLabelText('Alias'), 'ana.brubank')
    await user.click(within(sheet).getByRole('button', { name: 'Guardar' }))
    expect(state.saveTransfer).toHaveBeenCalledWith({
      id: 'bru',
      data: { alias: 'ana.brubank', cbu: null },
    })
    // Still in the same sheet.
    expect(screen.getByRole('dialog', { name: 'Enviar cobro' })).toBeVisible()
  })

  it('"Enviar por Moni" sends the in-app notice with only the chosen account, after the tap', async () => {
    const { user, sheet } = await openCollect()
    await user.click(within(sheet).getByRole('button', { name: /Galicia/ }))
    expect(state.remind).not.toHaveBeenCalled()
    await user.click(within(sheet).getByRole('button', { name: 'Enviar por Moni' }))
    expect(state.remind).toHaveBeenCalledWith({
      groupId: 'g1',
      debtorId: 'joni',
      amountCents: 10_000_00,
      account: {
        label: 'Galicia',
        alias: 'ana.galicia',
        cbu: '0070000030000012345678',
        numberLabel: 'CBU',
        kindLabel: 'Banco',
      },
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar cobro' })).toBeNull())
  })

  it('it can be sent without any account data', async () => {
    const { user, sheet } = await openCollect()
    await user.click(within(sheet).getByRole('button', { name: 'Enviar por Moni' }))
    expect(state.remind.mock.calls[0]?.[0]).toMatchObject({ account: null })
  })

  it('shows why a reminder was refused', async () => {
    state.remind.mockRejectedValue(new Error('reminder_too_soon'))
    const { user, sheet } = await openCollect()
    await user.click(within(sheet).getByRole('button', { name: 'Enviar por Moni' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Ya le recordaste este pago hoy',
    )
  })

  it('"Compartir" opens the device share menu with the message (there is no WhatsApp-only button)', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      const { user, sheet } = await openCollect()
      expect(within(sheet).queryByText(/WhatsApp/)).toBeNull()
      await user.click(within(sheet).getByRole('button', { name: /Galicia/ }))
      await user.click(within(sheet).getByRole('button', { name: 'Compartir' }))
      expect(share).toHaveBeenCalledTimes(1)
      expect(share.mock.calls[0]?.[0].text).toContain('Alias: ana.galicia')
      expect(state.remind).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(navigator, 'share')
    }
  })

  it('without the device share menu, "Compartir" opens WhatsApp with the same message', async () => {
    Reflect.deleteProperty(navigator, 'share')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    try {
      const { user, sheet } = await openCollect()
      await user.click(within(sheet).getByRole('button', { name: /Galicia/ }))
      await user.click(within(sheet).getByRole('button', { name: 'Compartir' }))
      expect(open).toHaveBeenCalledTimes(1)
      const url = String(open.mock.calls[0]?.[0])
      expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/)
      expect(decodeURIComponent(url)).toContain('Alias: ana.galicia')
      expect(state.remind).not.toHaveBeenCalled()
    } finally {
      open.mockRestore()
    }
  })

  it('"Copiar mensaje" copies the whole message and sends nothing', async () => {
    const { user, sheet } = await openCollect()
    await user.click(within(sheet).getByRole('button', { name: /Mercado Pago/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Copiar mensaje' }))
    const copied = await navigator.clipboard.readText()
    expect(copied).toContain('¡Hola, Joni!')
    expect(copied).toContain('Alias: ana.mp')
    expect(copied).toContain('Enviado desde Moni')
    expect(state.remind).not.toHaveBeenCalled()
  })

  it('with no banks or wallets it points to Medios de pago', async () => {
    state.accounts = [makeAccount({ id: 'cash', name: 'Efectivo', kind: 'cash' })]
    const { sheet } = await openCollect()
    expect(within(sheet).getByRole('link', { name: 'Agregar un medio de pago' })).toHaveAttribute(
      'href',
      '/cuentas',
    )
  })

  it('a payment already reported is confirmed or refused by the receiver, not charged again', async () => {
    state.debts = [{ ...owedByJoni, report }]
    const user = renderSheet()
    expect(screen.queryByRole('button', { name: 'Enviar cobro' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    expect(state.confirm).toHaveBeenCalledWith('r1')
    await user.click(screen.getByRole('button', { name: 'No lo recibí' }))
    expect(state.reject).toHaveBeenCalledWith('r1')
  })

  it('says so when the debt had already been settled another way', async () => {
    state.confirm.mockResolvedValue(false)
    state.debts = [{ ...owedByJoni, report }]
    const user = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    expect(await screen.findByText(/ya estaba saldada/)).toBeVisible()
  })
})

describe('Debo', () => {
  it('shows the data the other person shared to be paid, with copy buttons', () => {
    state.debts = [iOweAna]
    state.notices = {
      data: [
        {
          id: 'n',
          kind: 'debt_reminder',
          groupId: 'g1',
          groupName: 'IJ',
          actorId: 'ana',
          actorName: 'Ana',
          amountCents: 12_500_00,
          reportId: null,
          transferLabel: 'Galicia',
          transferAlias: 'ana.galicia',
          transferCbu: '0070000030000012345678',
          createdAt: '2026-10-30T10:00:00Z',
          readAt: null,
        } satisfies Notice,
      ],
    }
    renderSheet('owe')
    expect(screen.getByText('Ana te compartió su cuenta Galicia:')).toBeVisible()
    expect(screen.getByText('Alias: ana.galicia')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copiar Alias' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copiar CBU/CVU' })).toBeVisible()
  })

  it('shows nothing of the kind when they did not share anything', () => {
    state.debts = [iOweAna]
    renderSheet('owe')
    expect(screen.queryByText(/te compartió/)).toBeNull()
  })

  it('"Ya pagué" asks first and only reports the payment (the debt is not settled by it)', async () => {
    state.debts = [iOweAna]
    const user = renderSheet('owe')
    await user.click(screen.getByRole('button', { name: 'Ya pagué' }))
    expect(state.report).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sí, ya pagué' }))
    expect(state.report).toHaveBeenCalledWith({
      groupId: 'g1',
      creditorId: 'ana',
      amountCents: 12_500_00,
    })
    expect(state.confirm).not.toHaveBeenCalled()
  })

  it('once reported it waits for the other person and the notice can be taken back', async () => {
    state.debts = [
      { ...iOweAna, report: { ...report, id: 'r2', fromUserId: 'me', toUserId: 'ana' } },
    ]
    const user = renderSheet('owe')
    expect(screen.queryByRole('button', { name: 'Ya pagué' })).toBeNull()
    expect(screen.getByText('Esperando que Ana lo confirme.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Anular aviso' }))
    expect(state.cancel).toHaveBeenCalledWith('r2')
  })
})

describe('Historial de pagos y migración pendiente', () => {
  it('lists the settled or not received payments with their state', async () => {
    state.reports = {
      data: [
        { ...report, id: 'h1', status: 'confirmed', resolvedAt: '2026-10-29T10:00:00Z' },
        {
          ...report,
          id: 'h2',
          status: 'rejected',
          amountCents: 5_000_00,
          resolvedAt: '2026-10-28T10:00:00Z',
        },
        { ...report, id: 'open', status: 'reported' },
      ],
      isError: false,
      error: null,
    }
    const user = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Historial de pagos' }))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Saldada')
    expect(items[1]).toHaveTextContent('No recibido')
  })

  it('before the database is ready the debts are listed, but nothing can be confirmed or reported', async () => {
    state.debts = [owedByJoni, iOweAna]
    state.reports = { data: [], isError: true, error: { code: 'PGRST205' } }
    const user = renderSheet('owed')
    expect(screen.getByText('Joni Ríos')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Debo' }))
    expect(screen.queryByRole('button', { name: 'Ya pagué' })).toBeNull()
  })
})
