import { MemoryRouter } from 'react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/shared/ui/Toast'
import type { Subscription, SubscriptionCharge, SubscriptionOverview } from '../domain/subscription'
import { SubscriptionsPanel } from './SubscriptionsPanel'

const link = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const dismiss = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const notCharged = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const setStatus = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const overview = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('../api/useSubscriptions', () => ({
  useSubscriptions: () => ({
    isLoading: false,
    isError: false,
    data: overview.current,
    refetch: vi.fn(),
  }),
  useMarkChargeNotCharged: () => ({ mutateAsync: notCharged, isPending: false }),
  useLinkChargeToExpense: () => ({ mutateAsync: link, isPending: false }),
  useDismissDuplicate: () => ({ mutateAsync: dismiss, isPending: false }),
  useSetSubscriptionStatus: () => ({ mutateAsync: setStatus, isPending: false }),
  useCreateSubscription: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSubscription: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))
const categoriesData = vi.hoisted(() => ({ current: [] as unknown[] }))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({ data: categoriesData.current }),
}))
const antsThreshold = vi.hoisted(() => ({ current: null as number | null }))
vi.mock('@/features/insights/api/useAnts', () => ({
  useAnts: () => ({ data: antsThreshold.current === null ? undefined : { thresholdCents: antsThreshold.current } }),
}))

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  serviceId: 'netflix',
  name: 'Netflix',
  plan: null,
  amountCents: 18_000_00,
  period: 'monthly',
  nextChargeOn: '2026-11-18',
  accountId: 'a1',
  accountName: 'Galicia',
  accountKind: 'bank',
  categoryId: 'c1',
  remind: true,
  status: 'active',
  ...over,
})
const charge = (over: Partial<SubscriptionCharge>): SubscriptionCharge => ({
  id: 'ch1',
  subscriptionId: 's1',
  dueOn: '2026-10-18',
  amountCents: 18_000_00,
  status: 'posted',
  voidedElsewhere: false,
  failureReason: null,
  negativeBalance: false,
  overLimit: false,
  balanceAfterCents: null,
  possibleDuplicate: null,
  ...over,
})

function setup(data: Partial<SubscriptionOverview>, url = '/recurrentes') {
  overview.current = { today: '2026-10-29', subscriptions: [], charges: [], ...data }
  const onAdd = vi.fn()
  render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <SubscriptionsPanel onAdd={onAdd} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return { onAdd, user: userEvent.setup() }
}

describe('SubscriptionsPanel', () => {
  beforeEach(() => {
    ;[link, dismiss, notCharged, setStatus].forEach((f) => f.mockClear())
    categoriesData.current = []
    antsThreshold.current = null
  })

  it('shows active count, monthly and yearly totals in ARS and what is paused or cancelled', () => {
    setup({
      subscriptions: [
        sub({}),
        sub({
          id: 's2',
          name: 'Spotify',
          serviceId: 'spotify',
          amountCents: 6_500_00,
          nextChargeOn: '2026-11-09',
        }),
        sub({ id: 's3', name: 'Dropbox', serviceId: 'dropbox', status: 'paused' }),
        sub({ id: 's4', name: 'Crunchyroll', serviceId: 'crunchyroll', status: 'cancelled' }),
      ],
    })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('suscripciones activas')).toBeInTheDocument()
    expect(screen.getByText(/\$24\.500 por mes · \$294\.000 al año/)).toBeInTheDocument()
    expect(screen.getByText('Próximos cobros')).toBeInTheDocument()
    expect(screen.getByText('Pausadas')).toBeInTheDocument()
    expect(screen.getByText('Canceladas en Moni')).toBeInTheDocument()
    // Upcoming charges are ordered by date: Spotify (9 nov) before Netflix (18 nov).
    const upcoming = screen.getByText('Próximos cobros').parentElement?.nextElementSibling
    expect(within(upcoming as HTMLElement).getAllByRole('button')[0]).toHaveAccessibleName(
      /Spotify/,
    )
  })

  it('shows the logo of each subscription in upcoming charges and history', () => {
    setup({ subscriptions: [sub({})], charges: [charge({})] })
    expect(document.querySelectorAll('img[src*="netflix"]').length).toBeGreaterThanOrEqual(2)
  })

  it('a push opens the detail of the subscription it is about (?suscripcion=<id>)', () => {
    setup({ today: '2026-11-17', subscriptions: [sub({})] }, '/recurrentes?suscripcion=s1')
    expect(screen.getByRole('dialog')).toHaveTextContent('Netflix')
  })

  it('reminds the day before, in Moni and by push', () => {
    setup({ today: '2026-11-17', subscriptions: [sub({})] })
    expect(screen.getByText('Mañana se cobra Netflix: $18.000 de Galicia')).toBeInTheDocument()
    expect(screen.getByText(/con una notificación push al celular/)).toBeInTheDocument()
  })

  it('warns about a negative balance and points to the detail, where the charge can be voided', async () => {
    const { user } = setup({
      subscriptions: [sub({})],
      charges: [charge({ negativeBalance: true, balanceAfterCents: -7_000_00 })],
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/saldo negativo \(-\$7\.000\)/)
    // The list has no void action of its own: it only leads to the detail.
    expect(screen.queryByRole('button', { name: /Anular cobro/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ver Netflix' }))
    await user.click(screen.getByRole('button', { name: /Anular cobro Netflix/ }))
    expect(screen.getByText('¿Anular este cobro?')).toBeInTheDocument()
    expect(screen.getByText(/anula el gasto de \$18\.000/)).toBeInTheDocument()
    expect(screen.getByText(/Si el servicio sí te cobró, no lo anules/)).toBeInTheDocument()
    expect(notCharged).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Anular cobro' }))
    expect(notCharged).toHaveBeenCalledWith('ch1')
  })

  it('warns when a card charge takes the debt over the credit limit', () => {
    setup({
      subscriptions: [sub({ accountName: 'Visa', accountKind: 'credit_card' })],
      charges: [charge({ overLimit: true })],
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/deuda de Visa superó su límite de crédito/)
  })

  it('a possible duplicate is only a warning: "Ya lo cargué" links, "No es duplicado" dismisses', async () => {
    const { user } = setup({
      subscriptions: [sub({})],
      charges: [
        charge({
          possibleDuplicate: {
            id: 'tx9',
            occurredOn: '2026-10-17',
            note: 'netflix',
            amountCents: 18_000_00,
          },
        }),
      ],
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Posible duplicado')
    expect(link).not.toHaveBeenCalled()
    await user.click(within(alert).getByRole('button', { name: /Ya lo cargué/ }))
    expect(link).toHaveBeenCalledWith({ chargeId: 'ch1', transactionId: 'tx9' })
    await user.click(within(alert).getByRole('button', { name: /No es duplicado/ }))
    expect(dismiss).toHaveBeenCalledWith('ch1')
  })

  it('a voided charge is shown as "Sin cobro" in the history of payments, with no action', () => {
    setup({ subscriptions: [sub({})], charges: [charge({ status: 'not_charged' })] })
    expect(screen.getByText('Historial de pagos')).toBeInTheDocument()
    expect(screen.queryByText('Historial de cobros')).toBeNull()
    expect(screen.getByText('Sin cobro')).toBeInTheDocument()
    expect(screen.queryByText('No se cobró')).toBeNull()
    expect(screen.queryByRole('button', { name: /Anular cobro/ })).toBeNull()
  })

  it('the detail lists the payments with their state and the void action only for charges that stand', async () => {
    const { user } = setup({
      subscriptions: [sub({})],
      charges: [charge({}), charge({ id: 'ch0', dueOn: '2026-09-18', status: 'not_charged' })],
    })
    await user.click(screen.getByRole('button', { name: /^Netflix, cobra/ }))
    expect(screen.getAllByText('Historial de pagos').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Anular cobro Netflix/ })).toHaveLength(1)
    expect(screen.getAllByText('Sin cobro').length).toBeGreaterThan(0)
  })

  it('cancelling asks first and says it does not cancel the real service', async () => {
    const { user } = setup({ subscriptions: [sub({})] })
    await user.click(screen.getByRole('button', { name: /^Netflix, cobra/ }))
    await user.click(screen.getByRole('button', { name: 'Cancelar en Moni' }))
    expect(screen.getByText(/Esto no cancela la suscripción real/)).toBeInTheDocument()
    expect(setStatus).not.toHaveBeenCalled()
    await user.click(
      screen.getAllByRole('button', { name: 'Cancelar en Moni' }).at(-1) as HTMLElement,
    )
    expect(setStatus).toHaveBeenCalledWith({ id: 's1', status: 'cancelled' })
  })

  it('pauses and reactivates', async () => {
    const { user } = setup({ subscriptions: [sub({ status: 'paused' })] })
    await user.click(screen.getByRole('button', { name: /^Netflix, pausada/ }))
    expect(screen.getByText(/sin cargar lo que pasó mientras tanto/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reactivar' }))
    expect(setStatus).toHaveBeenCalledWith({ id: 's1', status: 'active' })
  })

  it('a cancelled subscription keeps its history and offers to reactivate', async () => {
    const { user } = setup({
      subscriptions: [sub({ status: 'cancelled' })],
      charges: [charge({})],
    })
    await user.click(screen.getByRole('button', { name: /^Netflix, cancelada/ }))
    expect(screen.getAllByText('$18.000').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('invites to add the first subscription', async () => {
    const { user, onAdd } = setup({})
    await user.click(screen.getByRole('button', { name: 'Agregar una suscripción' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('shows each subscription\'s category and filters the list by category', async () => {
    categoriesData.current = [
      { id: 'c1', kind: 'expense', name: 'Entretenimiento', icon: 'Tv', color: '#000', archivedAt: null },
      { id: 'c2', kind: 'expense', name: 'Trabajo', icon: 'Briefcase', color: '#000', archivedAt: null },
    ]
    const { user } = setup({
      subscriptions: [
        sub({ categoryId: 'c1' }),
        sub({ id: 's2', name: 'Notion', serviceId: 'notion', categoryId: 'c2', nextChargeOn: '2026-11-09' }),
      ],
    })
    expect(screen.getByRole('button', { name: /Netflix.*Entretenimiento/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Notion.*Trabajo/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Trabajo' }))
    expect(screen.queryByRole('button', { name: /Netflix/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Notion/ })).toBeInTheDocument()
  })

  it('marks a subscription as "Hormiga" only when its monthly cost is at or below the threshold', () => {
    antsThreshold.current = 10_000_00
    setup({
      subscriptions: [
        sub({ id: 's1', name: 'Chica', amountCents: 5_000_00 }),
        sub({ id: 's2', name: 'Grande', amountCents: 50_000_00, nextChargeOn: '2026-11-09' }),
      ],
    })
    expect(screen.getByRole('button', { name: /Chica.*gasto hormiga/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Grande.*gasto hormiga/ })).toBeNull()
    expect(screen.getByText(/Tenés 1 suscripción chica que suma \$5\.000 por mes/)).toBeInTheDocument()
  })
})
