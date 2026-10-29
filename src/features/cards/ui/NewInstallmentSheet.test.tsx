import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { makeAccount } from '@/features/accounts/domain/testing'
import { NewInstallmentSheet } from './NewInstallmentSheet'

const CARD = '55555555-5555-4555-8555-555555555555'
const FOOD = '22222222-2222-4222-8222-222222222222'
const create = vi.hoisted(() => vi.fn().mockResolvedValue('plan-1'))
const accountsData = vi.hoisted(() => ({ current: [] as ReturnType<typeof makeAccount>[] }))

vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({ data: accountsData.current, isLoading: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({
    data: [
      {
        id: FOOD,
        kind: 'expense',
        name: 'Hogar',
        icon: 'House',
        color: '#E5533D',
        archivedAt: null,
      },
    ],
  }),
}))
vi.mock('../api/useCards', () => ({
  useCreateInstallmentPurchase: () => ({ mutateAsync: create, isPending: false }),
}))

const card = (extra = {}) =>
  makeAccount({
    id: CARD,
    name: 'Visa',
    kind: 'credit_card',
    closingDay: 25,
    dueDay: 5,
    creditLimitCents: 2_000_000_00,
    balanceCents: 0,
    ...extra,
  })

async function fill(user: ReturnType<typeof userEvent.setup>, total = '840000') {
  await user.type(screen.getByLabelText('Qué compraste'), 'Heladera')
  await user.type(screen.getByLabelText('Total de la compra'), total)
  await user.click(screen.getByRole('button', { name: 'Hogar' }))
}

function setup() {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <NewInstallmentSheet monthlyNow={42_000_00} onClose={onClose} />
    </MemoryRouter>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('NewInstallmentSheet', () => {
  beforeEach(() => {
    create.mockClear()
    accountsData.current = [card()]
  })

  it('previews the monthly amount, the end month and the new monthly load', async () => {
    const { user } = setup()
    await fill(user)
    expect(await screen.findByText(/\$70\.000 por mes/)).toBeInTheDocument()
    expect(screen.getByText(/Tus cuotas pasan a \$112\.000 por mes/)).toBeInTheDocument()
    expect(screen.getByText(/Se suman \$840\.000 a tu deuda desde hoy/)).toBeInTheDocument()
  })

  it('saves the whole purchase once, with the statement shown and the installment you are on', async () => {
    const { user, onClose } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Voy en la cuota 1/ }))
    await user.dblClick(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
    const input = create.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      accountId: CARD,
      description: 'Heladera',
      categoryId: FOOD,
      totalCents: 840_000_00,
      count: 12,
      currentNumber: 2,
    })
    expect(input.firstClosing).toMatch(/^\d{4}-\d{2}-25$/)
    expect(input.requestKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('lets the first installment move to another statement', async () => {
    const { user } = setup()
    await fill(user)
    const before = screen.getByRole('button', {
      name: 'Cambiar el resumen de la primera cuota',
    }).textContent
    await user.click(screen.getByRole('button', { name: 'Cambiar el resumen de la primera cuota' }))
    const after = screen.getByRole('button', {
      name: 'Cambiar el resumen de la primera cuota',
    }).textContent
    expect(after).not.toBe(before)
  })

  it('warns when the whole purchase goes over the limit and saves only if you continue', async () => {
    accountsData.current = [card({ creditLimitCents: 500_000_00, balanceCents: -100_000_00 })]
    const { user, onClose } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Te pasás del límite')
    expect(dialog).toHaveTextContent('Aunque la pagues en 12 cuotas')
    expect(dialog).toHaveTextContent('-$440.000')
    expect(create).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continuar igual' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('cancelling the limit warning saves nothing', async () => {
    accountsData.current = [card({ creditLimitCents: 100_00 })]
    const { user, onClose } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(create).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks for a configured card first and cannot save without one', async () => {
    accountsData.current = [card({ closingDay: null, dueDay: null })]
    const { user } = setup()
    await fill(user)
    expect(
      screen.getByText(/primero necesitás una tarjeta con su día de cierre/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('shows the database error and does not close', async () => {
    create.mockRejectedValueOnce({ message: 'invalid_statement' })
    const { user, onClose } = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no es válido para esta tarjeta')
    expect(onClose).not.toHaveBeenCalled()
  })
})
