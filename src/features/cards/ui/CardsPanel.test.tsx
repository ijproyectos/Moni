import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import type { CardOverview } from '../domain/overview'
import { buildStatementBars } from '../domain/statementChart'
import { CardsPanel } from './CardsPanel'

const accountsData = vi.hoisted(() => ({ current: [] as Account[], loading: false }))
const openNew = vi.hoisted(() => vi.fn())

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ isLoading: accountsData.loading, data: accountsData.current }),
}))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew, openEdit: vi.fn() }),
}))
const income = vi.hoisted(() => ({ cents: 1_850_000_00 as number | null }))
const overviewFor = (accountId: string): CardOverview => ({
  accountId,
  configured: true,
  creditLimitCents: 500_000_00,
  closingDay: 23,
  dueDay: 4,
  billedCents: 0,
  openCents: 412_300_00,
  futureCents: 0,
  debtTotalCents: 412_300_00,
  inFavorCents: 0,
  availableCents: 87_700_00,
  nextClosingOn: '2026-11-23',
  nextDueOn: '2026-12-04',
  statements: [
    {
      closingOn: '2026-11-23',
      dueOn: '2026-12-04',
      chargedCents: 412_300_00,
      paidCents: 0,
      remainingCents: 412_300_00,
      status: 'open',
    },
    {
      closingOn: '2026-12-23',
      dueOn: '2027-01-04',
      chargedCents: 100_000_00,
      paidCents: 0,
      remainingCents: 100_000_00,
      status: 'future',
    },
  ],
})
vi.mock('../api/useCards', () => ({
  useCardOverview: (id: string) => ({ isLoading: false, data: overviewFor(id) }),
}))
vi.mock('../api/useStatementBars', () => ({
  useStatementBars: (_id: string, statements: Parameters<typeof buildStatementBars>[0]) => ({
    isLoading: false,
    bars: buildStatementBars(statements, new Map([['2026-11-23', 100_000_00]])),
  }),
}))
vi.mock('../api/useInstallmentViews', () => ({
  useInstallmentViews: () => ({
    isLoading: false,
    views: [
      {
        id: 'p1',
        accountId: 'visa',
        description: 'Heladera',
        count: 12,
        paid: 9,
        installmentCents: 62_500_00,
        remainingCents: 187_500_00,
        endsOn: '2027-02-04',
      },
    ],
  }),
}))
vi.mock('@/features/dashboard/api/useExpectedIncome', () => ({
  useExpectedIncome: () => ({ isLoading: false, incomeCents: income.cents }),
}))
// The summary keeps its own tests; it only needs to be there.
vi.mock('./CardSummarySection', () => ({
  CardSummarySection: ({
    accountId,
    onPay,
  }: {
    accountId: string
    onPay: (c?: number) => void
  }) => (
    <button type="button" onClick={() => onPay(5_000_00)}>
      resumen {accountId}
    </button>
  ),
}))

const visa = makeAccount({
  id: 'visa',
  name: 'Visa',
  kind: 'credit_card',
  balanceCents: -60_000_00,
  creditLimitCents: 500_000_00,
  closingDay: 25,
  dueDay: 5,
})

function renderPanel() {
  const onEdit = vi.fn()
  const onAdd = vi.fn()
  render(
    <MemoryRouter>
      <CardsPanel onEdit={onEdit} onAdd={onAdd} />
    </MemoryRouter>,
  )
  return { user: userEvent.setup(), onEdit, onAdd }
}

describe('CardsPanel (Tarjetas tab of Medios de pago)', () => {
  beforeEach(() => {
    accountsData.current = [makeAccount({ id: 'cash', name: 'Efectivo' }), visa]
    accountsData.loading = false
    openNew.mockClear()
    income.cents = 1_850_000_00
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00-03:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('lists each card (never a cash account) with its cycle and the active one pressed', () => {
    renderPanel()
    const tab = screen.getByRole('button', { name: /^Visa/ })
    expect(tab).toHaveAttribute('aria-pressed', 'true')
    expect(tab).toHaveTextContent('Cierra 23 nov · Vence 4 dic')
    expect(screen.queryByRole('button', { name: /^Efectivo/ })).toBeNull()
    expect(screen.getByText(/Cierra el 25 · vence el 5 · límite \$500\.000/)).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'resumen visa' })).toBeInTheDocument()
  })

  it('shows the next statement against the ceiling (20% of the expected income)', () => {
    renderPanel()
    const next = screen.getByRole('region', { name: 'Próximo resumen' })
    expect(next).toHaveTextContent('vence 4 dic')
    expect(next).toHaveTextContent('$412.300')
    expect(next).toHaveTextContent('+$42.300 sobre el techo')
    expect(next).toHaveTextContent('Techo $370.000 (20% de ingresos)')
    expect(screen.getByTestId('ceiling-line')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Próximos 2 resúmenes: Dic \$412\.300, Ene \$100\.000/ })).toBeInTheDocument()
  })

  it('draws no ceiling and no chip without income', () => {
    income.cents = null
    renderPanel()
    expect(screen.queryByTestId('ceiling-line')).toBeNull()
    expect(screen.queryByText(/sobre el techo/)).toBeNull()
    expect(screen.queryByText(/Techo/)).toBeNull()
  })

  it('tips when a purchase moves to the following statement', () => {
    renderPanel()
    expect(
      screen.getByText('Si comprás después del día 25, entra en el resumen de enero.'),
    ).toBeInTheDocument()
  })

  it('lists the active installments with a link to all of them', () => {
    renderPanel()
    const section = screen.getByRole('region', { name: 'Cuotas activas' })
    expect(section).toHaveTextContent('Heladera')
    expect(section).toHaveTextContent('Visa · cuota 9/12 · termina feb')
    expect(screen.getByRole('link', { name: 'Ver las 1 →' })).toHaveAttribute('href', '/cuentas?tab=cuotas')
  })

  it('links to the cuotas vs contado simulator', () => {
    renderPanel()
    expect(screen.getByRole('link', { name: /¿Cuotas o contado\?/ })).toHaveAttribute('href', '/tarjetas/simulador')
  })

  it('switches the active card from the selector', async () => {
    accountsData.current = [visa, makeAccount({ ...visa, id: 'naranja', name: 'Naranja X' })]
    const { user } = renderPanel()
    await user.click(screen.getByRole('button', { name: /^Naranja X/ }))
    expect(screen.getByRole('button', { name: /^Naranja X/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'resumen naranja' })).toBeInTheDocument()
  })

  it('paying the billed amount opens the transfer to that card', async () => {
    const { user } = renderPanel()
    await user.click(screen.getByRole('button', { name: 'resumen visa' }))
    expect(openNew).toHaveBeenCalledWith('transfer', { toAccountId: 'visa', amountCents: 5_000_00 })
  })

  it('editing a card hands it to the Medios de pago sheet', async () => {
    const { user, onEdit } = renderPanel()
    await user.click(screen.getByRole('button', { name: 'Editar la tarjeta' }))
    expect(onEdit).toHaveBeenCalledWith(visa)
  })

  it('without cards it offers to add one', async () => {
    accountsData.current = [makeAccount({ id: 'cash', name: 'Efectivo' })]
    const { user, onAdd } = renderPanel()
    expect(screen.getByText('Todavía no tenés tarjetas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar una tarjeta' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('shows a loading state while accounts load', () => {
    accountsData.loading = true
    accountsData.current = []
    renderPanel()
    expect(screen.getByRole('status', { name: 'Cargando tarjetas' })).toBeInTheDocument()
  })
})
