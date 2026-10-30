import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeAccount } from '@/features/accounts/domain/testing'
import { argentinaTodayIso } from '@/shared/lib/month'
import { ToastProvider } from '@/shared/ui/Toast'
import { findService } from '../domain/catalog'
import type { Subscription } from '../domain/subscription'
import { SubscriptionFormSheet } from './SubscriptionFormSheet'

const create = vi.hoisted(() => vi.fn().mockResolvedValue('new-id'))
const update = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const CAT_SUBS = '33333333-3333-4333-8333-333333333333'
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
        id: CAT_SUBS,
        kind: 'expense',
        name: 'Suscripciones',
        icon: 'Repeat',
        color: '#6B4FB8',
        archivedAt: null,
      },
    ],
  }),
}))
vi.mock('../api/useSubscriptions', () => ({
  useCreateSubscription: () => ({ mutateAsync: create, isPending: false }),
  useUpdateSubscription: () => ({ mutateAsync: update, isPending: false }),
}))

function renderSheet(target: Parameters<typeof SubscriptionFormSheet>[0]['target']) {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <SubscriptionFormSheet target={target} onClose={onClose} />
    </ToastProvider>,
  )
  return { onClose, user: userEvent.setup() }
}

describe('SubscriptionFormSheet', () => {
  beforeEach(() => {
    create.mockClear()
    update.mockClear()
  })

  it('adds a catalog subscription in pesos with plan, frequency, date, account and category', async () => {
    const service = findService('netflix')
    if (!service) throw new Error('catalog')
    const { user, onClose } = renderSheet({ kind: 'catalog', service })
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Estándar' }))
    await user.type(screen.getByLabelText('Monto en pesos'), '18000')
    await user.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'Visa · Tarjeta')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const { input, requestKey } = create.mock.calls[0]?.[0] ?? {}
    expect(input).toMatchObject({
      serviceId: 'netflix',
      name: 'Netflix',
      plan: 'Estándar',
      amountCents: 18_000_00,
      period: 'monthly',
      nextChargeOn: argentinaTodayIso(),
      accountId: 'visa',
      // Preselected from the kind of service: streaming → Suscripciones.
      categoryId: CAT_SUBS,
      remind: true,
    })
    expect(requestKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('says everything is in ARS: no conversions and no taxes', () => {
    renderSheet({ kind: 'custom', name: 'Mi club' })
    expect(screen.getByText(/Moni no convierte dólares ni calcula impuestos/)).toBeInTheDocument()
  })

  it('a custom subscription asks for a name and cannot be saved without amount', async () => {
    const { user } = renderSheet({ kind: 'custom', name: '' })
    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Nombre de la suscripción'), 'Club de lectura')
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Monto en pesos'), '3500')
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]?.[0].input).toMatchObject({
      serviceId: 'custom',
      name: 'Club de lectura',
    })
  })

  it('does not accept a charge date in the past', async () => {
    const { user } = renderSheet({ kind: 'custom', name: 'X' })
    await user.type(screen.getByLabelText('Monto en pesos'), '100')
    const date = screen.getByLabelText('Próximo cobro')
    await user.clear(date)
    await user.type(date, '2020-01-01')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('a double tap saves once', async () => {
    const service = findService('spotify')
    if (!service) throw new Error('catalog')
    const { user } = renderSheet({ kind: 'catalog', service })
    await user.type(screen.getByLabelText('Monto en pesos'), '6500')
    const save = screen.getByRole('button', { name: 'Guardar' })
    await user.dblClick(save)
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('editing starts from the saved values and says the changes only apply to the next charges', async () => {
    const subscription: Subscription = {
      id: 's1',
      serviceId: 'netflix',
      name: 'Netflix',
      plan: 'Premium',
      amountCents: 18_000_00,
      period: 'monthly',
      nextChargeOn: '2999-01-18',
      accountId: 'galicia',
      accountName: 'Galicia',
      accountKind: 'bank',
      categoryId: CAT_SUBS,
      remind: false,
      status: 'active',
    }
    const { user } = renderSheet({ kind: 'edit', subscription })
    expect(screen.getByLabelText('Monto en pesos')).toHaveValue('18.000')
    expect(screen.getByLabelText('Próximo cobro')).toHaveValue('2999-01-18')
    expect(screen.getByText(/valen para los próximos cobros/)).toBeInTheDocument()
    const amount = screen.getByLabelText('Monto en pesos')
    await user.clear(amount)
    await user.type(amount, '20000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      id: 's1',
      input: { amountCents: 20_000_00, plan: 'Premium', remind: false, accountId: 'galicia' },
    })
  })
})
