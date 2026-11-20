import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import type { Transaction } from '../domain/transaction'
import type { Category } from '@/features/categories/domain/category'
import { makeTransaction } from '../domain/testing'
import { TransactionForm } from './TransactionForm'

const rateQuery = vi.hoisted(() => ({
  value: { data: { sell: 1350, updatedAt: '2026-11-15T12:00:00Z' }, isError: false } as {
    data: { sell: number; updatedAt: string } | undefined
    isError: boolean
  },
}))
vi.mock('@/features/subscriptions/api/useDollarCardRate', () => ({
  useDollarCardRate: () => rateQuery.value,
}))

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222'
const accounts: Account[] = [makeAccount({ id: ACCOUNT_ID })]
const categories: Category[] = [
  {
    id: CATEGORY_ID,
    kind: 'expense',
    name: 'Comida',
    icon: 'Utensils',
    color: '#E5533D',
    archivedAt: null,
  },
]

function setup(initial?: Transaction) {
  const onSubmit = vi.fn()
  const onCreateCategory = vi.fn()
  render(
    <TransactionForm
      kind="expense"
      accounts={accounts}
      categories={categories}
      initial={initial}
      isSubmitting={false}
      submitError={null}
      onSubmit={onSubmit}
      onCreateCategory={onCreateCategory}
    />,
  )
  return { onSubmit, onCreateCategory, user: userEvent.setup() }
}

describe('TransactionForm', () => {
  it('requires an amount and a category', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(await screen.findByText('Ingresá un monto mayor a cero.')).toBeInTheDocument()
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits integer cents with the chosen category and account', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Monto'), '12.500,50')
    await user.type(screen.getByLabelText('Nota'), 'Almuerzo con el equipo')
    await user.click(screen.getByRole('button', { name: 'Comida' }))
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 1_250_050,
      note: 'Almuerzo con el equipo',
    })
  })

  it('shows thousands separators while typing and still submits the right cents', async () => {
    const { onSubmit, user } = setup()
    const amount = screen.getByLabelText('Monto') as HTMLInputElement
    await user.type(amount, '1234567')
    expect(amount.value).toBe('1.234.567')
    await user.type(amount, ',5')
    expect(amount.value).toBe('1.234.567,5')
    await user.click(screen.getByRole('button', { name: 'Comida' }))
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ amount: 123_456_750 })
  })

  it('offers the categories as chips with their icon; the picked one is pressed', async () => {
    const { user } = setup()
    const group = screen.getByRole('group', { name: 'Categoría' })
    const chip = within(group).getByRole('button', { name: 'Comida' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.querySelector('svg')).not.toBeNull()
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('"Nueva" opens the creation flow without selecting anything', async () => {
    const { user, onCreateCategory } = setup()
    await user.click(screen.getByRole('button', { name: 'Nueva categoría' }))
    expect(onCreateCategory).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('the amount takes the on-screen keypad and keeps the native date picker for the date', async () => {
    const { onSubmit, user } = setup()
    const amount = screen.getByLabelText('Monto')
    // The custom keypad types; the native keyboard stays closed on the amount only.
    expect(amount).toHaveAttribute('inputmode', 'none')
    expect(screen.getByLabelText('Fecha')).toHaveAttribute('type', 'date')
    const keypad = within(screen.getByRole('group', { name: 'Teclado numérico' }))
    for (const key of ['2', '5', '0', '0', '0'])
      await user.click(keypad.getByRole('button', { name: key }))
    expect(amount).toHaveValue('25.000')
    await user.click(screen.getByRole('button', { name: 'Comida' }))
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ amount: 2_500_000 })
  })

  describe('USD', () => {
    beforeEach(() => {
      rateQuery.value = { data: { sell: 1350, updatedAt: '2026-11-15T12:00:00Z' }, isError: false }
    })

    it('converts at the dólar tarjeta rate, shows the equivalent and submits both amounts', async () => {
      const { onSubmit, user } = setup()
      await user.click(screen.getByRole('button', { name: 'USD' }))
      await user.type(screen.getByLabelText('Monto'), '20')
      expect(screen.getByText(/al dólar/)).toHaveTextContent('≈ $27.000 al dólar tarjeta $1.350')
      await user.click(screen.getByRole('button', { name: 'Comida' }))
      await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
        amount: 2_700_000,
        currency: 'USD',
        fxRate: 1350,
        originalAmountCents: 2000,
      })
    })

    it('disables USD and warns when there is no rate; never invents one', () => {
      rateQuery.value = { data: undefined, isError: true }
      setup()
      expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled()
      expect(
        screen.getByText('No pudimos traer la cotización del dólar. Probá de nuevo.'),
      ).toBeInTheDocument()
    })

    it("reopens a USD movement in dollars with its saved rate, not today's", async () => {
      const { onSubmit, user } = setup(
        makeTransaction({
          amountCents: 2_600_000,
          originalAmountCents: 2000,
          originalCurrency: 'USD',
          fxRate: 1300,
        }),
      )
      expect(screen.getByLabelText('Monto')).toHaveValue('20')
      expect(screen.getByText(/al dólar/)).toHaveTextContent('$26.000 al dólar tarjeta $1.300')
      await user.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ amount: 2_600_000, fxRate: 1300 })
    })
  })
})
