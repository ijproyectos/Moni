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

  it('shows the monthly ESTIMATE and what was REALLY paid as two clearly different figures', () => {
    setup()
    expect(screen.getByText('Estimado por mes')).toBeInTheDocument()
    expect(screen.getByText('$130.000')).toBeInTheDocument() // luz 30.000 + alquiler 100.000 (active only)
    expect(screen.getByText('Pagado en noviembre')).toBeInTheDocument()
    // Only what was paid in November (hero, plus the row of that payment in the history).
    expect(screen.getAllByText('$31.500').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('$140.500')).toBeNull()
    expect(screen.getByText(/Lo que realmente registraste como pagado/)).toBeInTheDocument()
  })

  it('is organised in Pendientes, Próximos and Historial', () => {
    setup()
    expect(screen.getByText('Pendientes de confirmar')).toBeInTheDocument()
    expect(screen.getByText('Próximos vencimientos')).toBeInTheDocument()
    expect(screen.getByText('Historial de pagos')).toBeInTheDocument()
  })

  it('an overdue bill stays pending and says so plainly; one due today says "Vence hoy"', () => {
    setup()
    expect(screen.getByText('Vencido hace 5 días (5 nov)')).toBeInTheDocument()
    expect(screen.getByText('Vence hoy')).toBeInTheDocument()
    // The overdue one comes first.
    const buttons = screen.getAllByRole('button', { name: /^Registrar pago de/ })
    expect(buttons[0]).toHaveAccessibleName('Registrar pago de Luz')
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

  it('upcoming lists the active ones by next due date with the estimate', () => {
    setup()
    const upcoming = screen.getByText('Próximos vencimientos').parentElement
      ?.nextElementSibling as HTMLElement
    const rows = within(upcoming).getAllByRole('button')
    expect(rows[0]).toHaveAccessibleName('Luz, vence el 5 dic')
    expect(rows[1]).toHaveAccessibleName('Alquiler, vence el 10 dic')
    expect(within(upcoming).getAllByText(/≈ \$/).length).toBe(2)
    expect(within(upcoming).queryByText('Gas')).toBeNull()
  })

  it('the history keeps standing payments, voided payments and skipped bills, with real amount and dates apart', () => {
    setup()
    const history = screen.getByText('Historial de pagos').parentElement
      ?.nextElementSibling as HTMLElement
    expect(
      within(history).getByText('Pagado el 2 nov 2026 · vencía el 5 oct 2026'),
    ).toBeInTheDocument()
    expect(within(history).getByText('Pago anulado')).toBeInTheDocument()
    expect(within(history).getAllByText('Omitido').length).toBeGreaterThan(0)
    // Estimated is shown next to the real amount when they differ.
    expect(within(history).getAllByText('Estimado $30.000').length).toBeGreaterThan(0)
  })

  it('the pending bill of a PAUSED expense is kept but apart: a notice in Activos, the bill itself under Pausados', async () => {
    const { user } = setup()
    // Activos: only the pending bills of active expenses, plus a notice about the paused one.
    expect(screen.getAllByRole('button', { name: /^Registrar pago de/ })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Registrar pago de Gas' })).toBeNull()
    expect(
      screen.getByRole('button', { name: /Ten.s 1\s+vencimiento pendiente de\s+gastos pausados/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Verlos/ }))
    // Pausados: that bill is there and can still be paid, moved or skipped.
    expect(screen.getByText('Vencimientos pendientes de gastos pausados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar pago de Gas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar fecha de Gas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Omitir Gas' })).toBeInTheDocument()
    // ...and it is not mixed with the upcoming payments.
    expect(screen.queryByText('Próximos vencimientos')).toBeNull()
  })

  it('paused and removed expenses live behind filters, not in the main lists', async () => {
    const { user } = setup()
    expect(screen.queryByRole('button', { name: /^Gas, pausado/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Pausados' }))
    expect(screen.getByRole('button', { name: /^Gas, pausado/ })).toBeInTheDocument()
    expect(screen.queryByText('Pendientes de confirmar')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Eliminados' }))
    expect(
      screen.getByRole('button', { name: /^Patente, seguimiento eliminado/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Activos' }))
    expect(screen.getByText('Pendientes de confirmar')).toBeInTheDocument()
  })

  it('invites to add the first one when there is none', async () => {
    const { user, onAdd } = setup({ expenses: [], occurrences: [], payments: [] })
    expect(screen.getByText('Todavía no cargaste gastos fijos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar un gasto fijo' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('says there is nothing pending when everything is settled', () => {
    setup({ occurrences: [] })
    expect(screen.getByText('No tenés vencimientos pendientes.')).toBeInTheDocument()
  })
})
