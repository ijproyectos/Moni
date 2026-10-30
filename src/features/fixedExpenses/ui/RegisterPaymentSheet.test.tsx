import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import { argentinaTodayIso, addDays } from '@/shared/lib/month'
import { ToastProvider } from '@/shared/ui/Toast'
import { pendingBills } from '../domain/fixedExpense'
import { makeExpense, makeOccurrence, makeOverview } from '../domain/testing'
import { RegisterPaymentSheet } from './RegisterPaymentSheet'

const register = vi.hoisted(() => vi.fn().mockResolvedValue('payment-id'))
const link = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const candidates = vi.hoisted(() => ({ current: [] as unknown[] }))
const accountsData = vi.hoisted(() => ({ current: [] as Account[] }))

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: accountsData.current }),
}))
vi.mock('../api/useFixedExpenses', () => ({
  useRegisterPayment: () => ({ mutateAsync: register, isPending: false }),
  useLinkExistingExpense: () => ({ mutateAsync: link, isPending: false }),
  useDuplicateCandidates: () => ({ data: candidates.current }),
}))

const today = argentinaTodayIso()

function setup(opts: { due?: string; estimate?: number; moved?: string | null } = {}) {
  const due = opts.due ?? today
  const overview = makeOverview({
    today,
    expenses: [makeExpense({ id: 'luz', accountId: 'galicia', accountName: 'Galicia' })],
    occurrences: [
      makeOccurrence({
        id: 'occ',
        fixedExpenseId: 'luz',
        dueOn: due,
        rescheduledTo: opts.moved ?? null,
        expectedCents: opts.estimate ?? 30_000_00,
      }),
    ],
  })
  const bill = pendingBills(overview)[0]
  if (!bill) throw new Error('bill')
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <RegisterPaymentSheet bill={bill} onClose={onClose} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('RegisterPaymentSheet', () => {
  beforeEach(() => {
    register.mockClear()
    link.mockClear()
    candidates.current = []
    accountsData.current = [
      makeAccount({ id: 'galicia', name: 'Galicia', kind: 'bank', balanceCents: 500_000_00 }),
      makeAccount({ id: 'efectivo', name: 'Efectivo', kind: 'cash', balanceCents: 10_000_00 }),
      makeAccount({
        id: 'visa',
        name: 'Visa',
        kind: 'credit_card',
        balanceCents: -90_000_00,
        creditLimitCents: 100_000_00,
      }),
    ]
  })

  it('asks the question of the due day and says Moni does not make the payment', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Registrar pago' })).toBeInTheDocument()
    expect(screen.getByText('Hoy vence tu factura de luz. ¿Cuánto pagaste?')).toBeInTheDocument()
    expect(screen.getByText(/Moni no hace el pago/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pagar/ })).toBeNull()
  })

  it('starts from the estimate and registers the REAL amount with the payment date, apart from the due date', async () => {
    const { user, onClose } = setup({ due: addDays(today, -4) })
    expect(screen.getByLabelText('Importe real')).toHaveValue('30.000')
    expect(screen.getByLabelText('Fecha de pago')).toHaveValue(today)
    expect(screen.getByText(/Vencimiento:/)).toBeInTheDocument()
    const amount = screen.getByLabelText('Importe real')
    await user.clear(amount)
    await user.type(amount, '33250')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1))
    const call = register.mock.calls[0]?.[0]
    expect(call).toMatchObject({
      occurrenceId: 'occ',
      amountCents: 33_250_00,
      paidOn: today,
      accountId: 'galicia',
      updateEstimate: false,
    })
    expect(call.requestKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('updating the next estimate is an option that starts OFF', async () => {
    const { user } = setup()
    const toggle = screen.getByRole('switch', { name: 'Usar este importe como próximo estimado' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(register.mock.calls[0]?.[0].updateEstimate).toBe(true)
  })

  it('a double tap registers once', async () => {
    const { user } = setup()
    await user.dblClick(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('cannot be saved with a future payment date or an amount of zero', async () => {
    const { user } = setup()
    const save = screen.getByRole('button', { name: 'Registrar pago' })
    const date = screen.getByLabelText('Fecha de pago')
    await user.clear(date)
    await user.type(date, addDays(today, 3))
    expect(save).toBeDisabled()
    await user.clear(date)
    await user.type(date, today)
    expect(save).toBeEnabled()
    const amount = screen.getByLabelText('Importe real')
    await user.clear(amount)
    await user.type(amount, '0')
    expect(save).toBeDisabled()
  })

  it('can be paid from another account', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'Efectivo')
    await user.clear(screen.getByLabelText('Importe real'))
    await user.type(screen.getByLabelText('Importe real'), '5000')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(register.mock.calls[0]?.[0]).toMatchObject({
      accountId: 'efectivo',
      amountCents: 5_000_00,
    })
  })

  it('warns before leaving an account negative and registers only if the person continues', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'Efectivo') // 10.000 < 30.000
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Te falta saldo')
    expect(register).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1))
  })

  it('warns about the credit limit (not about money) when the payment goes on a card over its limit', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'Visa · Tarjeta') // 10.000 available < 30.000
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Te pasás del límite')
    expect(register).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(register).not.toHaveBeenCalled()
  })

  it('a card with room needs no warning', async () => {
    accountsData.current = [
      makeAccount({ id: 'galicia', name: 'Galicia', kind: 'bank', balanceCents: 500_000_00 }),
      makeAccount({
        id: 'visa',
        name: 'Visa',
        kind: 'credit_card',
        balanceCents: 0,
        creditLimitCents: 500_000_00,
      }),
    ]
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'Visa · Tarjeta')
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows a possible duplicate; "Ya lo cargué" uses that expense and creates no new movement', async () => {
    candidates.current = [
      { id: 'tx9', occurredOn: addDays(today, -1), note: 'luz a mano', amountCents: 30_000_00 },
    ]
    const { user, onClose } = setup()
    expect(screen.getByRole('alert')).toHaveTextContent('Posible duplicado')
    expect(link).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^Ya lo cargué/ }))
    await waitFor(() =>
      expect(link).toHaveBeenCalledWith({ occurrenceId: 'occ', transactionId: 'tx9' }),
    )
    expect(register).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('with a possible duplicate the person can still register a NEW payment', async () => {
    candidates.current = [{ id: 'tx9', occurredOn: today, note: null, amountCents: 30_000_00 }]
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }))
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1))
    expect(link).not.toHaveBeenCalled()
  })

  it('an overdue bill asks with its date and a moved one shows both dates', () => {
    setup({ due: addDays(today, -6), moved: addDays(today, 2) })
    expect(screen.getByText(/movido al/)).toBeInTheDocument()
  })
})
