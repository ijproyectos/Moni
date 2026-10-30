import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { RecurringPage } from './RecurringPage'

vi.mock('@/features/subscriptions/ui/SubscriptionsPanel', () => ({
  SubscriptionsPanel: ({ onAdd }: { onAdd: () => void }) => (
    <button type="button" onClick={onAdd}>
      panel de suscripciones
    </button>
  ),
}))
vi.mock('@/features/fixedExpenses/ui/FixedExpensesPanel', () => ({
  FixedExpensesPanel: ({ onAdd }: { onAdd: () => void }) => (
    <button type="button" onClick={onAdd}>
      panel de gastos fijos
    </button>
  ),
}))
vi.mock('@/features/subscriptions/ui/NewSubscriptionFlow', () => ({
  NewSubscriptionFlow: () => <div role="dialog" aria-label="nueva suscripción" />,
}))
vi.mock('@/features/fixedExpenses/ui/NewFixedExpenseFlow', () => ({
  NewFixedExpenseFlow: () => <div role="dialog" aria-label="nuevo gasto fijo" />,
}))

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname + loc.search}</p>
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/recurrentes" element={<RecurringPage />} />
        <Route path="/cuentas" element={<p>cuentas</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('RecurringPage (Pagos recurrentes)', () => {
  it('is called "Pagos recurrentes" and has only two tabs: Suscripciones and Gastos fijos', () => {
    renderAt('/recurrentes')
    expect(screen.getByRole('heading', { name: 'Pagos recurrentes' })).toBeInTheDocument()
    expect(screen.queryByText('Fijos y cuotas')).toBeNull()
    expect(screen.getByRole('button', { name: 'Suscripciones' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Gastos fijos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cuotas' })).toBeNull()
  })

  it('starts on Suscripciones and the add button opens the subscription flow', async () => {
    const user = renderAt('/recurrentes')
    expect(screen.getByText('panel de suscripciones')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nueva suscripción' }))
    expect(screen.getByRole('dialog', { name: 'nueva suscripción' })).toBeInTheDocument()
  })

  it('opens on Gastos fijos from the URL; the add button then adds a fixed expense', async () => {
    const user = renderAt('/recurrentes?tab=gastos-fijos')
    expect(screen.getByText('panel de gastos fijos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto fijo' }))
    expect(screen.getByRole('dialog', { name: 'nuevo gasto fijo' })).toBeInTheDocument()
  })

  it('switching tabs keeps the URL in sync', async () => {
    const user = renderAt('/recurrentes')
    await user.click(screen.getByRole('button', { name: 'Gastos fijos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recurrentes?tab=gastos-fijos')
    await user.click(screen.getByRole('button', { name: 'Suscripciones' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/recurrentes$/)
  })

  it('an old ?tab=cuotas link goes to Medios de pago › Cuotas', () => {
    renderAt('/recurrentes?tab=cuotas')
    expect(screen.getByTestId('where')).toHaveTextContent('/cuentas?tab=cuotas')
  })
})
