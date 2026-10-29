import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account } from '@/features/accounts/domain/account'
import { makeAccount } from '@/features/accounts/domain/testing'
import type { Category } from '@/features/categories/domain/category'
import { TransactionForm } from './TransactionForm'

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

function setup() {
  const onSubmit = vi.fn()
  render(
    <TransactionForm
      kind="expense"
      accounts={accounts}
      categories={categories}
      isSubmitting={false}
      submitError={null}
      onSubmit={onSubmit}
      onCreateCategory={vi.fn()}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

describe('TransactionForm', () => {
  it('requires an amount and a category', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Ingresá un monto mayor a cero.')).toBeInTheDocument()
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits integer cents with the chosen category and account', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Monto'), '12.500,50')
    await user.type(screen.getByLabelText('Nota'), 'Almuerzo con el equipo')
    await user.click(screen.getByRole('button', { name: 'Comida' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: 'expense',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      amount: 1_250_050,
      note: 'Almuerzo con el equipo',
    })
  })
})
