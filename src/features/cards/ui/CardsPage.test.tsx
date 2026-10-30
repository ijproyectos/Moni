import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import { CardsPage } from './CardsPage'

const accountsData = vi.hoisted(() => ({ current: [] as Account[], loading: false }))
const openNew = vi.hoisted(() => vi.fn())

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ isLoading: accountsData.loading, data: accountsData.current }),
}))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew, openEdit: vi.fn() }),
}))
vi.mock('../api/useInstallmentViews', () => ({
  useInstallmentViews: () => ({
    views: [],
    monthlyCents: 12_000_00,
    isLoading: false,
    isError: false,
  }),
}))
// The summary, the installments panel and the purchase sheet keep their own tests; they only need to be there.
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
vi.mock('./InstallmentsPanel', () => ({ InstallmentsPanel: () => <p>panel de cuotas</p> }))
vi.mock('./NewInstallmentSheet', () => ({
  NewInstallmentSheet: ({ monthlyNow }: { monthlyNow: number }) => (
    <div role="dialog" aria-label={`nueva compra en cuotas (${monthlyNow})`} />
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

function renderPage(url = '/tarjetas') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <CardsPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('CardsPage (Tarjetas de crédito)', () => {
  beforeEach(() => {
    accountsData.current = [makeAccount({ id: 'cash', name: 'Efectivo' }), visa]
    accountsData.loading = false
    openNew.mockClear()
  })

  it('has two tabs: Mis tarjetas and Cuotas', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Tarjetas de crédito' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mis tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Cuotas' })).toBeInTheDocument()
  })

  it('lists each card (never a cash account) with its limit, closing, due date and available credit', () => {
    renderPage()
    expect(screen.getByText('Visa')).toBeInTheDocument()
    expect(screen.queryByText('Efectivo')).toBeNull()
    expect(screen.getByText(/Cierra el 25 · vence el 5 · límite \$500\.000/)).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText('$440.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'resumen visa' })).toBeInTheDocument()
  })

  it('paying the billed amount opens the transfer to that card, as in Medios de pago', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'resumen visa' }))
    expect(openNew).toHaveBeenCalledWith('transfer', { toAccountId: 'visa', amountCents: 5_000_00 })
  })

  it('the Cuotas tab shows the installments panel (the same one as before) and opens the purchase sheet', async () => {
    const user = renderPage('/tarjetas?tab=cuotas')
    expect(screen.getByRole('button', { name: 'Cuotas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('panel de cuotas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nueva compra en cuotas' }))
    expect(
      screen.getByRole('dialog', { name: 'nueva compra en cuotas (1200000)' }),
    ).toBeInTheDocument()
  })

  it('switching to Cuotas and back works', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Cuotas' }))
    expect(screen.getByText('panel de cuotas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mis tarjetas' }))
    expect(screen.queryByText('panel de cuotas')).toBeNull()
  })

  it('without cards it offers to add one from Medios de pago', () => {
    accountsData.current = [makeAccount({ id: 'cash', name: 'Efectivo' })]
    renderPage()
    expect(screen.getByText('Todavía no tenés tarjetas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agregar una tarjeta' })).toHaveAttribute(
      'href',
      '/cuentas',
    )
  })

  it('links to Medios de pago to edit the card', () => {
    renderPage()
    expect(
      screen.getByRole('link', { name: 'Editar la tarjeta en Medios de pago' }),
    ).toHaveAttribute('href', '/cuentas')
  })
})
