import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/shared/ui/Toast'
import { makeGoal, makeSavings, makeSavingsAccount } from '../domain/testing'
import { GoalsPage } from './GoalsPage'

const state = vi.hoisted(() => ({
  data: null as unknown,
  loading: false,
  error: false,
  errorValue: null as unknown,
}))
vi.mock('../api/useSavings', async () => {
  const domain = await import('../domain/savings')
  return {
    useSavings: () => ({
      data: state.data,
      isLoading: state.loading,
      isError: state.error,
      error: state.errorValue,
      refetch: vi.fn(),
    }),
    useSavingsAlerts: () => (state.data ? domain.savingsAlerts(state.data as never) : []),
    useGoalReminders: () => (state.data ? domain.goalReminders(state.data as never) : []),
    useSkipReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateSavingsGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useAddDeposit: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useWithdrawReserve: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useSnoozeReminder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }
})

function setup(
  data: unknown | null,
  opts: { loading?: boolean; error?: boolean; errorValue?: unknown } = {},
) {
  state.data = data
  state.loading = opts.loading ?? false
  state.error = opts.error ?? false
  state.errorValue = opts.errorValue ?? null
  render(
    <MemoryRouter initialEntries={['/metas']}>
      <ToastProvider>
        <Routes>
          <Route path="/metas" element={<GoalsPage />} />
          <Route path="/metas/:id" element={<p>detalle de meta</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const overview = makeSavings({
  accounts: [makeSavingsAccount()],
  goals: [
    makeGoal({ id: 'a', name: 'Viaje', reservedCents: 150_000_00, targetCents: 600_000_00 }),
    makeGoal({
      id: 'b',
      name: 'Auto',
      icon: 'auto',
      reservedCents: 50_000_00,
      targetCents: 400_000_00,
    }),
    makeGoal({
      id: 'c',
      name: 'Pausada',
      status: 'paused',
      reservedCents: 10_000_00,
      targetCents: 90_000_00,
    }),
    makeGoal({
      id: 'd',
      name: 'Hecha',
      status: 'completed',
      reservedCents: 0,
      targetCents: 90_000_00,
    }),
  ],
})

describe('GoalsPage (real goals)', () => {
  it('lists the active goals with their reserve and progress, and a summary of what is reserved', () => {
    setup(overview)
    expect(screen.getByRole('heading', { name: 'Metas' })).toBeInTheDocument()
    expect(screen.getByText('Reservado para tus metas')).toBeInTheDocument()
    expect(screen.getByText('$200.000')).toBeInTheDocument() // 150.000 + 50.000 of the ACTIVE goals
    expect(screen.getByText(/de \$1\.000\.000/)).toBeInTheDocument()
    expect(screen.getByText(/La plata sigue en tus cuentas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Viaje, 25% reservado/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Auto, 12% reservado/ })).toBeInTheDocument()
  })

  it('keeps paused, completed and archived goals out of the main list, one tap away', async () => {
    const user = setup(overview)
    expect(screen.queryByRole('button', { name: /^Pausada/ })).toBeNull()
    await user.click(
      screen.getByRole('button', { name: /Ver pausadas, completadas y archivadas \(2\)/ }),
    )
    expect(screen.getByRole('button', { name: /^Pausada/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Hecha/ })).toBeInTheDocument()
  })

  it('opens a goal', async () => {
    const user = setup(overview)
    await user.click(screen.getByRole('button', { name: /^Viaje/ }))
    expect(screen.getByText('detalle de meta')).toBeInTheDocument()
  })

  it('invites to create the first goal when there is none', async () => {
    const user = setup(makeSavings({ accounts: [makeSavingsAccount()] }))
    expect(screen.getByText('Todavía no tenés metas')).toBeInTheDocument()
    expect(screen.getByText(/La plata no sale de tu cuenta/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear mi primera meta' }))
    expect(screen.getByRole('dialog', { name: 'Nueva meta' })).toBeInTheDocument()
  })

  it('the + button opens the new goal sheet', async () => {
    const user = setup(overview)
    await user.click(screen.getByRole('button', { name: 'Nueva meta' }))
    expect(screen.getByRole('dialog', { name: 'Nueva meta' })).toBeInTheDocument()
  })

  it('shows the savings alert on top when an account no longer covers its reserves', () => {
    setup(
      makeSavings({
        accounts: [
          makeSavingsAccount({
            balanceCents: 20_000_00,
            reservedCents: 30_000_00,
            freeCents: -10_000_00,
          }),
        ],
        goals: [makeGoal()],
      }),
    )
    expect(
      screen.getByRole('region', { name: /Ahorros comprometidos en Galicia/ }),
    ).toBeInTheDocument()
  })

  it('shows a loading skeleton and an error with retry', () => {
    setup(null, { loading: true })
    expect(screen.getByRole('status', { name: 'Cargando metas' })).toBeInTheDocument()
  })

  it('an error offers to retry', () => {
    setup(null, { error: true })
    expect(screen.getByText('No pudimos cargar tus metas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('names the real cause when the database function is missing (PGRST202), not the connection', () => {
    setup(null, {
      error: true,
      errorValue: { code: 'PGRST202', message: 'Could not find the function' },
    })
    expect(screen.getByText('No pudimos cargar tus metas')).toBeInTheDocument()
    expect(screen.getByText(/falta aplicar su migración/)).toBeInTheDocument()
    expect(screen.queryByText(/Revisá tu conexión/)).toBeNull()
  })

  it('keeps the shortcuts to the installments calculator and to Aguinaldo, and the shared goals entry', () => {
    setup(overview)
    expect(screen.getByRole('link', { name: /Cuotas/ })).toHaveAttribute('href', '/metas/cuotas')
    expect(screen.getByRole('link', { name: /Aguinaldo/ })).toHaveAttribute('href', '/aguinaldo')
    expect(screen.getByRole('button', { name: /Compartidas/ })).toBeInTheDocument()
  })
})
