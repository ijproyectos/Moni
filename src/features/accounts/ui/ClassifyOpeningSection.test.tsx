import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Category } from '@/features/categories/domain/category'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeAccount } from '../domain/testing'
import { ClassifyOpeningSection } from './ClassifyOpeningSection'

const classify = vi.hoisted(() => vi.fn().mockResolvedValue(20000000))
vi.mock('../api/useAccounts', () => ({
  useClassifyOpeningBalance: () => ({ mutateAsync: classify, isPending: false }),
}))

const sueldo: Category = {
  id: 'c-sueldo',
  name: 'Sueldo',
  kind: 'income',
  icon: 'Wallet',
  color: '#0E8A6D',
  archivedAt: null,
}
const galicia = makeAccount({
  id: 'galicia',
  name: 'Galicia',
  kind: 'bank',
  openingBalanceCents: 200_000_00,
  balanceCents: 200_000_00,
})

function setup(onDone = vi.fn()) {
  render(
    <ToastProvider>
      <ClassifyOpeningSection account={galicia} incomeCategories={[sueldo]} onDone={onDone} />
    </ToastProvider>,
  )
  return { onDone, user: userEvent.setup() }
}

describe('ClassifyOpeningSection', () => {
  beforeEach(() => classify.mockClear())

  it('explains that the balance will not be added again', () => {
    setup()
    expect(screen.getByText(/\$200\.000/)).toBeInTheDocument()
    expect(screen.getByText(/sin volver a sumarlos al saldo/)).toBeInTheDocument()
  })

  it('classifies the starting balance as the salary of a chosen day', async () => {
    const { user, onDone } = setup()
    await user.click(screen.getByRole('radio', { name: /Mi sueldo/ }))
    const date = screen.getByLabelText('Fecha del ingreso')
    await user.clear(date)
    await user.type(date, '2026-10-05')
    await user.click(screen.getByRole('button', { name: 'Clasificar saldo inicial' }))
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1))
    expect(classify).toHaveBeenCalledWith({
      id: 'galicia',
      origin: { source: 'salary', categoryId: 'c-sueldo', occurredOn: '2026-10-05' },
    })
    expect(onDone).toHaveBeenCalled()
  })

  it('can be classified as money the person already had', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Clasificar saldo inicial' }))
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1))
    expect(classify.mock.calls[0]?.[0]).toMatchObject({ origin: { source: 'previous' } })
  })

  it('does not call the database while a category is missing', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: /Otro ingreso/ }))
    await user.click(screen.getByRole('button', { name: 'Clasificar saldo inicial' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí una categoría')
    expect(classify).not.toHaveBeenCalled()
  })
})
