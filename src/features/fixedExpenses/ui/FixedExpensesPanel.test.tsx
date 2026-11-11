import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeExpense, makeOccurrence, makeOverview, makePayment } from '../domain/testing'
import { FixedExpensesPanel } from './FixedExpensesPanel'

const skip = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const overview = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('../api/useFixedExpenses', () => ({
  useFixedExpenses: () => ({
    isLoading: false,
    isError: false,
    data: overview.current,
    refetch: vi.fn(),
  }),
  useSkipOccurrence: () => ({ mutateAsync: skip, isPending: false }),
  useSetFixedExpenseStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVoidPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCorrectPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// The sheets have their own tests; here they only need to show up.
vi.mock('./RegisterPaymentSheet', () => ({
  RegisterPaymentSheet: ({ bill }: { bill: { expense: { name: string } } }) => (
    <div role="dialog" aria-label={`Registrar pago de ${bill.expense.name} (hoja)`} />
  ),
}))
vi.mock('./RescheduleSheet', () => ({
  RescheduleSheet: ({ bill }: { bill: { expense: { name: string } } }) => (
    <div role="dialog" aria-label={`Cambiar fecha de ${bill.expense.name} (hoja)`} />
  ),
}))

const luz = makeExpense({ id: 'luz', name: 'Luz' })
const alquiler = makeExpense({
  id: 'alq',
  kindId: 'alquiler',
  name: 'Alquiler',
  amountCents: 100_000_00,
  nextDueOn: '2026-12-10',
})
const gas = makeExpense({ id: 'gas', kindId: 'gas', name: 'Gas', status: 'paused' })
const patente = makeExpense({ id: 'pat', kindId: 'custom', name: 'Patente', status: 'removed' })

function setup(data = {}) {
  overview.current = makeOverview({
    expenses: [luz, alquiler, gas, patente],
    occurrences: [
      makeOccurrence({ id: 'o-luz', fixedExpenseId: 'luz', dueOn: '2026-11-05' }),
      makeOccurrence({
        id: 'o-alq',
        fixedExpenseId: 'alq',
        dueOn: '2026-11-10',
        expectedCents: 100_000_00,
      }),
      makeOccurrence({ id: 'o-old', fixedExpenseId: 'luz', dueOn: '2026-10-05', status: 'paid' }),
      makeOccurrence({
        id: 'o-gas',
        fixedExpenseId: 'gas',
        dueOn: '2026-10-28',
        expectedCents: 18_000_00,
      }),
      makeOccurrence({
        id: 'o-skip',
        fixedExpenseId: 'gas',
        dueOn: '2026-09-20',
        status: 'skipped',
        note: 'Omitido',
      }),
    ],
    payments: [
      makePayment({
        id: 'p1',
        occurrenceId: 'o-old',
        fixedExpenseId: 'luz',
        amountCents: 31_500_00,
        paidOn: '2026-11-02',
      }),
      makePayment({
        id: 'p2',
        occurrenceId: 'o-old',
        fixedExpenseId: 'luz',
        amountCents: 9_000_00,
        paidOn: '2026-10-02',
        status: 'voided',
      }),
      makePayment({
        id: 'p3',
        occurrenceId: 'o-old',
        fixedExpenseId: 'alq',
        amountCents: 100_000_00,
        paidOn: '2026-10-10',
      }),
    ],
    ...data,
  })
  const onAdd = vi.fn()
  render(
    <ToastProvider>
      <FixedExpensesPanel onAdd={onAdd} />
    </ToastProvider>,
  )
  return { onAdd, user: userEvent.setup() }
}

describe('FixedExpensesPanel', () => {
  beforeEach(() => skip.mockClear())

  it('shows what is left to debit this month against what was really paid', () => {
    setup()
    const card = screen.getByRole('region', { name: 'Faltan debitar este mes' })
    // luz (overdue, 30.000) + alquiler (today, 100.000) still to go; 31.500 really paid in November.
    expect(within(card).getByText('$130.000')).toBeInTheDocument()
    expect(card).toHaveTextContent('de $161.500')
    expect(within(card).getByText('Pagado')).toBeInTheDocument()
    expect(within(card).getByText('Por venir')).toBeInTheDocument()
  })

  it('lists the debits of the month by date with their state, and keeps what is later apart', () => {
    setup()
    const month = screen.getByRole('list', { name: 'Gastos fijos de este mes' })
    const rows = within(month).getAllByRole('button', { name: /, (Pagado|Vence hoy|Vencido hace)/ })
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Luz, Pagado',
      'Luz, Vencido hace 5 días',
      'Alquiler, Vence hoy',
    ])
    expect(screen.getByText('Próximos vencimientos')).toBeInTheDocument()
    expect(screen.getByText('Historial de pagos')).toBeInTheDocument()
    expect(within(month).queryByText('Gas')).toBeNull()
  })

  it('names the next debit only when there is a real one ahead', () => {
    setup()
    expect(screen.getByText('Hoy se debita Alquiler.')).toBeInTheDocument()
    expect(screen.queryByText(/Ya está contado/)).toBeNull()
  })

  it('has no Moni note when nothing is left to debit', () => {
    setup({ occurrences: [], expenses: [alquiler] })
    expect(screen.queryByText(/se debita/)).toBeNull()
  })

  it('offers "Registrar pago" (not "Pagar"), "Cambiar fecha" and "Omitir" on each pending bill', async () => {
    const { user } = setup()
    expect(screen.queryByRole('button', { name: /^Pagar/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Cambiar fecha de/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^Omitir/ })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Registrar pago de Luz' }))
    expect(screen.getByRole('dialog', { name: 'Registrar pago de Luz (hoja)' })).toBeInTheDocument()
  })

  it('moving the date opens its sheet', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cambiar fecha de Alquiler' }))
    expect(
      screen.getByRole('dialog', { name: 'Cambiar fecha de Alquiler (hoja)' }),
    ).toBeInTheDocument()
  })

  it('skipping asks first, explains nothing is registered and then calls skip', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Omitir Luz' }))
    expect(screen.getByText(/No se registra ningún gasto/)).toBeInTheDocument()
    expect(skip).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Omitir' }))
    expect(skip).toHaveBeenCalledWith('o-luz')
  })

  it('what falls after this month lists the active ones by next due date with the estimate', () => {
    setup()
    const upcoming = screen.getByText('Próximos vencimientos').nextElementSibling as HTMLElement
    const rows = within(upcoming).getAllByRole('button')
    expect(rows[0]).toHaveAccessibleName('Luz, vence el 5 dic')
    expect(rows[1]).toHaveAccessibleName('Alquiler, vence el 10 dic')
    expect(within(upcoming).getAllByText(/≈ \$/).length).toBe(2)
    expect(within(upcoming).queryByText('Gas')).toBeNull()
  })

  it('the history keeps standing payments, voided payments and skipped bills, with real amount and dates apart', () => {
    setup()
    const history = screen.getByText('Historial de pagos').nextElementSibling as HTMLElement
    expect(
      within(history).getByText('Pagado el 2 nov 2026 · vencía el 5 oct 2026'),
    ).toBeInTheDocument()
    expect(within(history).getByText('Pago anulado')).toBeInTheDocument()
    expect(within(history).getAllByText('Omitido').length).toBeGreaterThan(0)
    // Estimated is shown next to the real amount when they differ.
    expect(within(history).getAllByText('Estimado $30.000').length).toBeGreaterThan(0)
  })

  it('the filter has only Activos and Eliminados, and only shows up when something was removed', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Ver' })
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Activos', 'Eliminados'])
    expect(screen.queryByRole('button', { name: 'Pausados' })).toBeNull()
  })

  it('has no filter when nothing was removed', () => {
    setup({ expenses: [luz, alquiler, gas] })
    expect(screen.queryByRole('group', { name: 'Ver' })).toBeNull()
  })

  it('Activos shows only active expenses and their pending bills; paused ones are not listed', () => {
    setup()
    // The pending bill of the paused expense is not shown, and there is no notice leading nowhere.
    expect(screen.getAllByRole('button', { name: /^Registrar pago de/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Registrar pago de Gas' })).toBeNull()
    expect(screen.queryByRole('button', { name: /gastos pausados/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Gas, (pausado|vence)/ })).toBeNull()
  })

  it('removed expenses live behind their own filter, not in the main lists', async () => {
    const { user } = setup()
    expect(screen.queryByRole('button', { name: /^Patente, / })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Eliminados' }))
    expect(
      screen.getByRole('button', { name: /^Patente, seguimiento eliminado/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Faltan debitar este mes' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Gas, (pausado|vence)/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Activos' }))
    expect(screen.getByRole('region', { name: 'Faltan debitar este mes' })).toBeInTheDocument()
  })

  it('invites to add the first one when there is none', async () => {
    const { user, onAdd } = setup({ expenses: [], occurrences: [], payments: [] })
    expect(screen.getByText('Todavía no cargaste gastos fijos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar un gasto fijo' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('shows nothing to confirm when everything is settled', () => {
    setup({ occurrences: [] })
    expect(screen.queryByRole('button', { name: /^Registrar pago de/ })).toBeNull()
  })
})
