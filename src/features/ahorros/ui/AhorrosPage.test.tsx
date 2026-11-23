import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import type { AhorroEntry } from '../domain/ahorros'
import { AhorrosPage } from './AhorrosPage'

const state = vi.hoisted(() => ({ entries: [] as unknown[], voidEntry: vi.fn(), usesUsd: true }))
vi.mock('@/features/settings/api/useSecondaryCurrency', () => ({
  useSecondaryCurrency: () => ({ usesUsd: state.usesUsd, isLoading: false, setUsesUsd: vi.fn(), isSaving: false }),
}))
vi.mock('../api/useAhorros', () => ({
  useAhorros: () => ({ data: state.entries, isLoading: false, isError: false, refetch: vi.fn() }),
  useVoidAhorro: () => ({ mutateAsync: state.voidEntry, isPending: false }),
  useCreateAhorro: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Banco', kind: 'bank', archivedAt: null },
      { id: 'a2', name: 'Efectivo', kind: 'cash', archivedAt: null },
    ],
  }),
}))

const entry = (over: Partial<AhorroEntry>): AhorroEntry => ({
  id: 'e', currency: 'ARS', kind: 'opening', amountCents: 100_00, occurredOn: '2026-11-01', note: null, accountId: null, status: 'posted', createdAt: '', ...over,
})

function setup() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AhorrosPage />
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Ahorros', () => {
  beforeEach(() => {
    state.entries = []
    state.usesUsd = true
    state.voidEntry.mockReset()
    state.voidEntry.mockResolvedValue(undefined)
  })

  it('shows pesos and dollars separately, each with its own figure, and nothing invented when empty', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Lo que tenés ahorrado' })
    expect(within(section).getByText('$0')).toBeInTheDocument()
    expect(within(section).getByText('US$ 0')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Movimientos' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retirar ahorro en pesos' })).toBeDisabled()
  })

  it('adds each currency on its own and lets a movement be deleted only after confirming', async () => {
    state.entries = [
      entry({ id: 'a', currency: 'ARS', kind: 'opening', amountCents: 150_000_00 }),
      entry({ id: 'b', currency: 'USD', kind: 'opening', amountCents: 300_00 }),
      entry({ id: 'c', currency: 'USD', kind: 'withdrawal', amountCents: 50_00 }),
    ]
    const user = setup()
    const section = screen.getByRole('region', { name: 'Lo que tenés ahorrado' })
    expect(within(section).getByText('$150.000')).toBeInTheDocument()
    expect(within(section).getByText('US$ 250')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Eliminar retiro de US$ 50' }))
    expect(state.voidEntry).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(state.voidEntry).toHaveBeenCalledWith('c')
  })

  it('opens the form for the chosen currency and offers the saldo inicial without creating income', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar ahorro en dólares' }))
    expect(screen.getByRole('dialog', { name: 'Agregar ahorro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dólares' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a withdrawal can only go back to an account that has savings reserved in it', async () => {
    state.entries = [entry({ id: 'd', kind: 'deposit', amountCents: 30_000_00, accountId: 'a1' })]
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Retirar ahorro en pesos' }))
    const accounts = screen.getByRole('group', { name: 'Cuenta' })
    expect(within(accounts).getByRole('button', { name: 'Banco' })).toBeInTheDocument()
    expect(within(accounts).queryByRole('button', { name: 'Efectivo' })).toBeNull()
  })

  it('adding offers every account (the server checks that the money is free)', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Agregar ahorro en pesos' }))
    const accounts = screen.getByRole('group', { name: 'Cuenta' })
    expect(within(accounts).getByRole('button', { name: 'Efectivo' })).toBeInTheDocument()
  })

  it('shows two cards, Pesos (ARS) and Dólares (USD), each with its balance, Agregar / Retirar and its own Historial', () => {
    state.entries = [
      entry({ id: 'a', currency: 'ARS', kind: 'opening', amountCents: 10_000_00 }),
      entry({ id: 'b', currency: 'USD', kind: 'deposit', amountCents: 200_00 }),
    ]
    setup()
    const ars = screen.getByRole('article', { name: 'Pesos (ARS)' })
    const usd = screen.getByRole('article', { name: 'Dólares (USD)' })
    expect(within(ars).getByText('$10.000', { selector: 'p' })).toBeInTheDocument()
    expect(within(ars).getByText('Historial')).toBeInTheDocument()
    expect(within(ars).getByText('+$10.000')).toBeInTheDocument()
    expect(within(ars).queryByText('+US$ 200')).toBeNull()
    expect(within(usd).getByText('+US$ 200')).toBeInTheDocument()
    expect(within(usd).getByRole('button', { name: 'Agregar ahorro en dólares' })).toBeInTheDocument()
  })

  it('with no savings both cards show $0 and an empty history, and can start', () => {
    setup()
    expect(within(screen.getByRole('article', { name: 'Pesos (ARS)' })).getByText('Sin movimientos')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Dólares (USD)' })).getByText('US$ 0')).toBeInTheDocument()
  })

  it('without dollars turned on it shows only pesos, and no currency choice in the form', async () => {
    state.usesUsd = false
    const user = setup()
    expect(screen.getByRole('article', { name: 'Pesos (ARS)' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Dólares (USD)' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Agregar ahorro en pesos' }))
    expect(screen.getByRole('group', { name: 'Moneda', hidden: true })).toHaveClass('hidden')
  })

  it('dollar savings that already exist are never hidden, even with dollars turned off', () => {
    state.usesUsd = false
    state.entries = [entry({ id: 'u', currency: 'USD', kind: 'opening', amountCents: 100_00 })]
    setup()
    expect(screen.getByRole('article', { name: 'Dólares (USD)' })).toBeInTheDocument()
  })
})
