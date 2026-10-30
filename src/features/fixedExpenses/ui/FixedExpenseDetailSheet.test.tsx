import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeExpense, makeOccurrence, makeOverview, makePayment } from '../domain/testing'
import { FixedExpenseDetailSheet } from './FixedExpenseDetailSheet'

const setStatus = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const voidPayment = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const correct = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../api/useFixedExpenses', () => ({
  useSetFixedExpenseStatus: () => ({ mutateAsync: setStatus, isPending: false }),
  useVoidPayment: () => ({ mutateAsync: voidPayment, isPending: false }),
  useCorrectPayment: () => ({ mutateAsync: correct, isPending: false }),
}))

const luz = makeExpense({ id: 'f1' })
function setup(over: { expense?: typeof luz; payments?: ReturnType<typeof makePayment>[] } = {}) {
  const expense = over.expense ?? luz
  const overview = makeOverview({
    expenses: [expense],
    occurrences: [
      makeOccurrence({ id: 'o1', dueOn: '2026-10-05', status: 'paid' }),
      makeOccurrence({ id: 'o0', dueOn: '2026-09-05', status: 'skipped', note: 'Omitido' }),
    ],
    payments: over.payments ?? [
      makePayment({ id: 'p1', occurrenceId: 'o1', paidOn: '2026-10-08', amountCents: 31_500_00 }),
    ],
  })
  const onEdit = vi.fn()
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <FixedExpenseDetailSheet
        expense={expense}
        overview={overview}
        onEdit={onEdit}
        onClose={onClose}
      />
    </ToastProvider>,
  )
  return { onEdit, onClose, user: userEvent.setup() }
}

describe('FixedExpenseDetailSheet', () => {
  beforeEach(() => [setStatus, voidPayment, correct].forEach((f) => f.mockClear()))

  it('shows the estimate as an estimate, the next due date and the history with real amounts', () => {
    setup()
    expect(screen.getByText('≈ $30.000')).toBeInTheDocument()
    expect(screen.getByText(/Próximo vencimiento:/)).toBeInTheDocument()
    expect(screen.getByText('Historial de pagos')).toBeInTheDocument()
    expect(screen.getByText('$31.500')).toBeInTheDocument()
    expect(screen.getByText('Pagado el 8 oct 2026 · vencía el 5 oct 2026')).toBeInTheDocument()
    expect(screen.getByText('Omitido', { selector: 'span' })).toBeInTheDocument()
  })

  it('pauses without confirmation noise and closes', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'f1', status: 'paused' })
    expect(onClose).toHaveBeenCalled()
  })

  it('deleting the follow-up asks first and says payments and movements are kept', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Eliminar seguimiento' }))
    expect(
      screen.getByText(/Los pagos y movimientos que ya registraste se conservan/),
    ).toBeInTheDocument()
    expect(setStatus).not.toHaveBeenCalled()
    await user.click(
      screen.getAllByRole('button', { name: 'Eliminar seguimiento' }).at(-1) as HTMLElement,
    )
    expect(setStatus).toHaveBeenCalledWith({ id: 'f1', status: 'removed' })
  })

  it('a paused expense can be reactivated; a removed one too, and cannot be edited', async () => {
    const paused = setup({ expense: makeExpense({ status: 'paused' }) })
    expect(screen.getByText(/sin sumar los que pasaron mientras tanto/)).toBeInTheDocument()
    expect(screen.getByText(/Los que ya estaban pendientes se\s+conservan/)).toBeInTheDocument()
    await paused.user.click(screen.getByRole('button', { name: 'Reactivar' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 'f1', status: 'active' })
  })

  it('a removed expense keeps its history, offers to reactivate and has no edit', () => {
    setup({ expense: makeExpense({ status: 'removed' }) })
    expect(
      screen.getByText(/Los pagos y movimientos que registraste se conservan/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar seguimiento' })).toBeNull()
  })

  it('undoing a payment asks first, explains the balance comes back and keeps the bill pending', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /^Anular pago de Luz/ }))
    expect(screen.getByText('¿Anular este pago?')).toBeInTheDocument()
    expect(screen.getByText(/devuelve el importe a la cuenta/)).toBeInTheDocument()
    expect(screen.getByText(/vuelve a quedar pendiente/)).toBeInTheDocument()
    expect(voidPayment).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: 'Anular pago' }).at(-1) as HTMLElement)
    expect(voidPayment).toHaveBeenCalledWith('p1')
  })

  it("undoing a LINKED payment says the person's own expense is not voided", async () => {
    const { user } = setup({
      payments: [makePayment({ id: 'p1', occurrenceId: 'o1', source: 'linked' })],
    })
    expect(screen.queryByRole('button', { name: /^Corregir/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Anular pago de Luz/ }))
    expect(screen.getByText(/El gasto que cargaste vos no se anula/)).toBeInTheDocument()
  })

  it('a payment whose movement was voided elsewhere is flagged and can go back to pending', async () => {
    const { user } = setup({
      payments: [makePayment({ id: 'p1', occurrenceId: 'o1', voidedElsewhere: true })],
    })
    expect(screen.getByText('Anulado en Movimientos')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/se anuló desde Movimientos/)
    expect(screen.queryByRole('button', { name: /^Corregir/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Volver a pendiente de Luz/ }))
    await user.click(
      screen.getAllByRole('button', { name: 'Volver a pendiente' }).at(-1) as HTMLElement,
    )
    expect(voidPayment).toHaveBeenCalledWith('p1')
  })

  it('correcting a payment changes amount and date of the same payment', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /^Corregir pago de Luz/ }))
    expect(screen.getByText(/no se crea otro/)).toBeInTheDocument()
    const amount = screen.getByLabelText('Importe real')
    await user.clear(amount)
    await user.type(amount, '30800')
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }))
    expect(correct).toHaveBeenCalledWith({
      paymentId: 'p1',
      amountCents: 30_800_00,
      paidOn: '2026-10-08',
    })
  })

  it('a voided payment stays in the history with its state and no actions', () => {
    setup({ payments: [makePayment({ id: 'p1', occurrenceId: 'o1', status: 'voided' })] })
    expect(screen.getByText('Pago anulado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Anular pago/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Corregir/ })).toBeNull()
  })
})
