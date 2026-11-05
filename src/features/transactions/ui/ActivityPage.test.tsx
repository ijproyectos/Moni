import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { monthStart, shiftMonth, todayIso } from '@/shared/lib/month'
import { makeTransaction } from '../domain/testing'
import { ActivityPage } from './ActivityPage'

const FOOD = '22222222-2222-4222-8222-222222222222'
const SALARY = '33333333-3333-4333-8333-333333333333'
const voidTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const voidPlan = vi.hoisted(() => vi.fn().mockResolvedValue(1))
const today = todayIso()
// Two months back: outside whatever month the page opens on.
const oldDay = `${shiftMonth(monthStart(today), -2).slice(0, 8)}15`

vi.mock('../api/useTransactions', () => ({
  useTransactions: () => ({
    isLoading: false,
    isError: false,
    data: [
      makeTransaction({
        id: 'e1',
        note: 'Cena',
        categoryId: FOOD,
        amountCents: 2_200_000,
        occurredOn: today,
      }),
      makeTransaction({
        id: 'i1',
        kind: 'income',
        note: 'Sueldo octubre',
        categoryId: SALARY,
        amountCents: 9_700_000,
        occurredOn: today,
      }),
      makeTransaction({
        id: 'o1',
        note: 'Alquiler viejo',
        categoryId: null,
        amountCents: 5_000_000,
        occurredOn: oldDay,
      }),
    ],
  }),
  useTransfers: () => ({ isLoading: false, isError: false, data: [] }),
  useVoidTransaction: () => ({ mutateAsync: voidTx, isPending: false }),
  useVoidTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/cards/api/useCards', () => ({
  useVoidInstallmentPlan: () => ({ mutateAsync: voidPlan, isPending: false }),
}))
vi.mock('@/features/categories/api/useCategories', () => ({
  useCategories: () => ({
    data: [
      {
        id: FOOD,
        kind: 'expense',
        name: 'Comida',
        icon: 'Utensils',
        color: '#E5533D',
        archivedAt: null,
      },
      {
        id: SALARY,
        kind: 'income',
        name: 'Sueldo',
        icon: 'Wallet',
        color: '#0E8A6D',
        archivedAt: null,
      },
    ],
  }),
}))
vi.mock('@/features/accounts/api/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }))

function setup() {
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('ActivityPage', () => {
  beforeEach(() => {
    voidTx.mockClear()
    window.localStorage.clear()
  })

  it('lists the month and filters by search text', async () => {
    const user = setup()
    expect(screen.getByText('3 movimientos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.type(screen.getByLabelText('Buscar por nota o categoría'), 'cena')
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()
    expect(screen.queryByText('Sueldo octubre')).not.toBeInTheDocument()
  })

  it('shows every movement by default, not only the current month', () => {
    setup()
    expect(screen.getByText('3 movimientos')).toBeInTheDocument()
    expect(screen.getByText('Alquiler viejo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows to the month only when "Por mes" is chosen, and goes back with "Todo"', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Por mes' }))
    expect(screen.getByText('2 movimientos')).toBeInTheDocument()
    expect(screen.queryByText('Alquiler viejo')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(screen.getByText('Alquiler viejo')).toBeInTheDocument()
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Todo' }))
    expect(screen.getByText('3 movimientos')).toBeInTheDocument()
  })

  it('list view without a month filter summarises everything and has no month navigation', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Agrupar por categoría' }))
    expect(screen.getByText('Todo el historial')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()
  })

  it('filters by kind by tapping Gastos or Ingresos, and tapping again clears it', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /^Ingresos/ }))
    expect(screen.getByRole('button', { name: /^Ingresos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('1 ingreso')).toBeInTheDocument()
    expect(screen.getByText('Sueldo octubre')).toBeInTheDocument()
    expect(screen.queryByText('Cena')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Ingresos/ }))
    expect(screen.getByText('3 movimientos')).toBeInTheDocument()
  })

  it('shows the totals of the month in the header', () => {
    setup()
    expect(screen.getByRole('button', { name: /^Gastos/ })).toHaveTextContent('$22.000')
    expect(screen.getByRole('button', { name: /^Ingresos/ })).toHaveTextContent('$97.000')
  })

  it('asks for confirmation before voiding a movement', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Anular Cena' }))
    const dialog = screen.getByRole('dialog', { name: '¿Anular este movimiento?' })
    expect(voidTx).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Anular' }))
    expect(voidTx).toHaveBeenCalledWith('e1')
  })

  it('cancelling the confirmation keeps the movement', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Anular Cena' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(voidTx).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  describe('calendar and grouping', () => {
    const groupByCategory = () => screen.getByRole('button', { name: 'Agrupar por categoría' })
    const groupByDay = () => screen.getByRole('button', { name: 'Ver por día' })
    const openMonth = (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('button', { name: 'Ver el mes completo' }))

    it('starts by days with the week strip, and the full month opens on demand', async () => {
      const user = setup()
      expect(screen.getByRole('group', { name: 'Últimos días del mes' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Calendario del mes' })).not.toBeInTheDocument()
      await openMonth(user)
      expect(screen.getByRole('region', { name: 'Calendario del mes' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Últimos días del mes' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Ocultar el calendario' }))
      expect(screen.queryByRole('region', { name: 'Calendario del mes' })).not.toBeInTheDocument()
    })

    it('the open calendar keeps its own month navigation', async () => {
      const user = setup()
      await openMonth(user)
      expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    })

    it('grouping by category lists the month by category, biggest total first, with no days', async () => {
      const user = setup()
      await user.click(groupByCategory())
      expect(screen.queryByRole('group', { name: 'Últimos días del mes' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Día \d+$/ })).not.toBeInTheDocument()
      const headings = screen
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
        .filter((t) => t === 'Sueldo' || t === 'Comida')
      expect(headings).toEqual(['Sueldo', 'Comida'])
      const comida = screen.getByRole('region', { name: 'Comida' })
      expect(within(comida).getByText('1 movimiento')).toBeInTheDocument()
      expect(within(comida).getByText('Cena')).toBeInTheDocument()
    })

    it('respects the search filter when grouped by category', async () => {
      const user = setup()
      await user.click(groupByCategory())
      await user.click(screen.getByRole('button', { name: 'Buscar' }))
      await user.type(screen.getByLabelText('Buscar por nota o categoría'), 'cena')
      expect(screen.getByRole('region', { name: 'Comida' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Sueldo' })).not.toBeInTheDocument()
    })

    it('ignores the selected day when grouped by category and restores it back by day', async () => {
      const user = setup()
      const otherDay = Number(today.slice(8, 10)) === 1 ? 2 : 1
      await openMonth(user)
      await user.click(screen.getByRole('button', { name: `Día ${otherDay}` }))
      expect(screen.getByText('No encontramos movimientos')).toBeInTheDocument()
      await user.click(groupByCategory())
      expect(screen.getByRole('region', { name: 'Comida' })).toBeInTheDocument()
      await user.click(groupByDay())
      expect(screen.getByText('No encontramos movimientos')).toBeInTheDocument()
    })

    it('filters by a day tapped on the week strip and clears it with a second tap', async () => {
      const user = setup()
      const todayNumber = Number(today.slice(8, 10))
      await user.click(screen.getByRole('button', { name: `Día ${todayNumber}` }))
      expect(screen.getByText('Cena')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Día ${todayNumber}` })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await user.click(screen.getByRole('button', { name: `Día ${todayNumber}` }))
      expect(screen.getByRole('button', { name: `Día ${todayNumber}` })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })

    it('remembers the chosen grouping', async () => {
      const user = setup()
      await user.click(groupByCategory())
      expect(window.localStorage.getItem('moni:activity-view:v1')).toBe('list')
    })

    it('opens in the stored grouping', () => {
      window.localStorage.setItem('moni:activity-view:v1', 'list')
      setup()
      expect(groupByDay()).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Comida' })).toBeInTheDocument()
    })

    it('falls back to days when the stored value is unknown', () => {
      window.localStorage.setItem('moni:activity-view:v1', 'grid')
      setup()
      expect(groupByCategory()).toBeInTheDocument()
    })
  })
})
