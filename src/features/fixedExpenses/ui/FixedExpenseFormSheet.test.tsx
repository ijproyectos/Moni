import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeAccount } from '@/features/accounts/domain/testing'
import { addDays, argentinaTodayIso } from '@/shared/lib/month'
import { ToastProvider } from '@/shared/ui/Toast'
import { findKind } from '../domain/catalog'
import { makeExpense } from '../domain/testing'
import { FixedExpenseFormSheet } from './FixedExpenseFormSheet'

const create = vi.hoisted(() => vi.fn().mockResolvedValue('id'))
const update = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const CAT_SERV = '33333333-3333-4333-8333-333333333333'
const CAT_FOOD = '44444444-4444-4444-8444-444444444444'

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      makeAccount({ id: 'galicia', name: 'Galicia', kind: 'bank' }),
      makeAccount({ id: 'visa', name: 'Visa', kind: 'credit_card' }),
    ],
  }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({
    data: [
      {
        id: CAT_FOOD,
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        archivedAt: null,
      },
      {
        id: CAT_SERV,
        kind: 'expense',
        name: 'Servicios',
        icon: 'Zap',
        color: '#6B4FB8',
        archivedAt: null,
      },
    ],
  }),
}))
vi.mock('../api/useFixedExpenses', () => ({
  useCreateFixedExpense: () => ({ mutateAsync: create, isPending: false }),
  useUpdateFixedExpense: () => ({ mutateAsync: update, isPending: false }),
}))

const today = argentinaTodayIso()
function renderSheet(target: Parameters<typeof FixedExpenseFormSheet>[0]['target']) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <FixedExpenseFormSheet target={target} onClose={onClose} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('FixedExpenseFormSheet', () => {
  beforeEach(() => {
    create.mockClear()
    update.mockClear()
  })

  it('adds a fixed expense with name, estimate in pesos, frequency, due date, account and category', async () => {
    const fixed = findKind('luz')
    if (!fixed) throw new Error('catalog')
    const { user, onClose } = renderSheet({ kind: 'catalog', fixed })
    expect(screen.getByLabelText('Nombre del gasto')).toHaveValue('Luz')
    await user.type(screen.getByLabelText('Importe estimado'), '32000')
    await user.click(screen.getByRole('button', { name: 'Bimestral' }))
    await user.selectOptions(screen.getByLabelText('Se paga con'), 'Visa · Tarjeta')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const { input, requestKey } = create.mock.calls[0]?.[0] ?? {}
    expect(input).toMatchObject({
      kindId: 'luz',
      name: 'Luz',
      amountCents: 32_000_00,
      period: 'bimonthly',
      nextDueOn: today,
      accountId: 'visa',
      // Preselected from the kind: a utility → "Servicios".
      categoryId: CAT_SERV,
      remind: true,
    })
    expect(requestKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('offers the three frequencies', () => {
    renderSheet({ kind: 'custom' })
    for (const label of ['Mensual', 'Bimestral', 'Anual']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('says the amount is an estimate that Moni never charges', () => {
    renderSheet({ kind: 'custom' })
    expect(
      screen.getByText(/Es solo una estimación y la podés cambiar todos los meses/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Moni no descuenta nada/)).toBeInTheDocument()
  })

  it('a custom expense needs its own name; the reminder is on by default and mentions no push', async () => {
    const { user } = renderSheet({ kind: 'custom' })
    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Nombre del gasto'), 'Patente')
    await user.type(screen.getByLabelText('Importe estimado'), '15000')
    expect(save).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Recordarme el vencimiento' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByText(/sin notificaciones push/)).toBeInTheDocument()
    await user.click(save)
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]?.[0].input).toMatchObject({ kindId: 'custom', name: 'Patente' })
  })

  it('allows a due date a few days in the past (it starts overdue) but not older than 45 days', async () => {
    const { user } = renderSheet({ kind: 'custom' })
    await user.type(screen.getByLabelText('Nombre del gasto'), 'X')
    await user.type(screen.getByLabelText('Importe estimado'), '100')
    const date = screen.getByLabelText('Próximo vencimiento')
    await user.clear(date)
    await user.type(date, addDays(today, -10))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    await user.clear(date)
    await user.type(date, addDays(today, -60))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('a double tap saves once', async () => {
    const { user } = renderSheet({ kind: 'custom' })
    await user.type(screen.getByLabelText('Nombre del gasto'), 'Y')
    await user.type(screen.getByLabelText('Importe estimado'), '100')
    await user.dblClick(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('editing starts from the saved values and the new estimate applies to what comes next', async () => {
    const expense = makeExpense({
      nextDueOn: addDays(today, 20),
      categoryId: CAT_SERV,
      remind: false,
    })
    const { user } = renderSheet({ kind: 'edit', expense })
    expect(screen.getByLabelText('Importe estimado')).toHaveValue('30.000')
    expect(screen.getByText(/Los cambios valen para los próximos vencimientos/)).toBeInTheDocument()
    const amount = screen.getByLabelText('Importe estimado')
    await user.clear(amount)
    await user.type(amount, '34500')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      id: 'f1',
      input: { amountCents: 34_500_00, remind: false, accountId: 'galicia', categoryId: CAT_SERV },
    })
  })
})
