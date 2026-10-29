import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CardOverview } from '../domain/overview'
import { CardSummarySection } from './CardSummarySection'

const overview: CardOverview = {
  accountId: 'c1',
  configured: true,
  creditLimitCents: 500_000_00,
  closingDay: 15,
  dueDay: 25,
  billedCents: 10_000_00,
  openCents: 30_000_00,
  futureCents: 50_000_00,
  debtTotalCents: 90_000_00,
  inFavorCents: 0,
  availableCents: 410_000_00,
  nextClosingOn: '2026-11-15',
  nextDueOn: '2026-11-25',
  statements: [
    {
      closingOn: '2026-10-15',
      dueOn: '2026-10-25',
      chargedCents: 30_000_00,
      paidCents: 20_000_00,
      remainingCents: 10_000_00,
      status: 'billed',
    },
    {
      closingOn: '2026-11-15',
      dueOn: '2026-11-25',
      chargedCents: 30_000_00,
      paidCents: 0,
      remainingCents: 30_000_00,
      status: 'open',
    },
    {
      closingOn: '2026-12-15',
      dueOn: '2026-12-25',
      chargedCents: 10_000_00,
      paidCents: 0,
      remainingCents: 10_000_00,
      status: 'future',
    },
  ],
}
const state = vi.hoisted(() => ({
  value: {} as { data?: unknown; isLoading?: boolean; isError?: boolean },
}))

vi.mock('../api/useCards', () => ({
  useCardOverview: () => state.value,
  useStatementItems: () => ({ data: [], isLoading: false, isError: false }),
}))

describe('CardSummarySection', () => {
  beforeEach(() => {
    state.value = { data: overview }
  })

  it('tells billed debt, to-be-billed, future installments, total and available apart', () => {
    render(<CardSummarySection accountId="c1" onPay={vi.fn()} />)
    const figure = (label: string) => screen.getByText(label).closest('div') as HTMLElement
    expect(figure('Deuda facturada')).toHaveTextContent('$10.000')
    expect(figure('Por facturar')).toHaveTextContent('$30.000')
    expect(figure('Cuotas futuras')).toHaveTextContent('$50.000')
    expect(figure('Deuda total')).toHaveTextContent('$90.000')
    expect(figure('Disponible')).toHaveTextContent('$410.000')
  })

  it('lists the statements with partial payments', () => {
    render(<CardSummarySection accountId="c1" onPay={vi.fn()} />)
    const list = screen.getByRole('list', { name: 'Resúmenes' })
    expect(list).toHaveTextContent('Pagaste $20.000 · falta $10.000')
    expect(list).toHaveTextContent('Facturado')
    expect(list).toHaveTextContent('En curso')
    expect(list).toHaveTextContent('Cuotas futuras')
  })

  it('offers to pay what is billed, prefilled', async () => {
    const onPay = vi.fn()
    render(<CardSummarySection accountId="c1" onPay={onPay} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Pagar lo facturado/ }))
    expect(onPay).toHaveBeenCalledWith(10_000_00)
  })

  it('shows a negative available in red when over the limit and "—" without limit', () => {
    state.value = { data: { ...overview, availableCents: -5_000_00 } }
    const { rerender } = render(<CardSummarySection accountId="c1" onPay={vi.fn()} />)
    expect(screen.getByText('-$5.000')).toHaveClass('text-expense')
    state.value = { data: { ...overview, creditLimitCents: null, availableCents: null } }
    rerender(<CardSummarySection accountId="c1" onPay={vi.fn()} />)
    expect(screen.getByText('Cargá un límite para verlo')).toBeInTheDocument()
  })

  it('degrades quietly when the summary cannot be loaded', () => {
    state.value = { isError: true }
    render(<CardSummarySection accountId="c1" onPay={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el resumen')
  })
})
