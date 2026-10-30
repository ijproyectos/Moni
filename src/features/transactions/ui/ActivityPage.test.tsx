import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { todayIso } from '@/shared/lib/month'
import { makeTransaction } from '../domain/testing'
import { ActivityPage } from './ActivityPage'

const FOOD = '22222222-2222-4222-8222-222222222222'
const SALARY = '33333333-3333-4333-8333-333333333333'
const voidTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const voidPlan = vi.hoisted(() => vi.fn().mockResolvedValue(1))
const today = todayIso()

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
    expect(screen.getByText('2 movimientos')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Buscar por nota o categoría'), 'cena')
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()
    expect(screen.queryByText('Sueldo octubre')).not.toBeInTheDocument()
  })

  it('filters by kind with the segmented control', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Ingresos' }))
    expect(screen.getByText('1 ingreso')).toBeInTheDocument()
    expect(screen.getByText('Sueldo octubre')).toBeInTheDocument()
    expect(screen.queryByText('Cena')).not.toBeInTheDocument()
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

  describe('view toggle', () => {
    const listButton = () => screen.getByRole('button', { name: 'Ver por categoría' })
    const calendarButton = () => screen.getByRole('button', { name: 'Ver calendario' })

    it('starts in calendar view with the calendar pressed', () => {
      setup()
      expect(calendarButton()).toHaveAttribute('aria-pressed', 'true')
      expect(listButton()).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('region', { name: 'Calendario del mes' })).toBeInTheDocument()
    })

    it('list view groups the month by category, biggest total first, and hides the day grid', async () => {
      const user = setup()
      await user.click(listButton())
      expect(listButton()).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('region', { name: 'Calendario del mes' })).not.toBeInTheDocument()
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

    it('respects the search filter in list view', async () => {
      const user = setup()
      await user.click(listButton())
      await user.type(screen.getByLabelText('Buscar por nota o categoría'), 'cena')
      expect(screen.getByRole('region', { name: 'Comida' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Sueldo' })).not.toBeInTheDocument()
    })

    it('ignores the selected day in list view and restores it back in calendar view', async () => {
      const user = setup()
      const otherDay = Number(today.slice(8, 10)) === 1 ? 2 : 1
      await user.click(screen.getByRole('button', { name: `Día ${otherDay}` }))
      expect(screen.getByText('No encontramos movimientos')).toBeInTheDocument()
      await user.click(listButton())
      expect(screen.getByRole('region', { name: 'Comida' })).toBeInTheDocument()
      await user.click(calendarButton())
      expect(screen.getByText('No encontramos movimientos')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Día ${otherDay}` })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('remembers the chosen view', async () => {
      const user = setup()
      await user.click(listButton())
      expect(window.localStorage.getItem('moni:activity-view:v1')).toBe('list')
    })

    it('opens in the stored view', () => {
      window.localStorage.setItem('moni:activity-view:v1', 'list')
      setup()
      expect(listButton()).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('region', { name: 'Comida' })).toBeInTheDocument()
    })

    it('falls back to calendar when the stored value is unknown', () => {
      window.localStorage.setItem('moni:activity-view:v1', 'grid')
      setup()
      expect(calendarButton()).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
