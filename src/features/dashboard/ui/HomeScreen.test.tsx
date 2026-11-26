import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

vi.mock('@/features/notifications/ui/NotificationCenter', () => ({
  PlusBell: () => <button type="button" aria-label="Notificaciones" />,
}))


vi.mock('@/features/transactions/ui/QuickAdd', () => ({
  QuickAdd: () => <section aria-label="Cargar un movimiento" />,
}))
vi.mock('@/features/assistant/ui/MoniAgent', () => ({
  MoniAgent: () => <div data-testid="moni-agent" />,
}))
vi.mock('@/features/plus/ui/PlusSheet', () => ({ PlusSheet: () => null }))

const empty: MonthSummary = {
  incomeCents: 0,
  expenseCents: 0,
  balanceCents: 0,
  availableBalanceCents: 0,
  byCategory: [],
  daily: [],
  recent: [],
}

const withData: MonthSummary = {
  ...empty,
  expenseCents: 11_950_000,
  incomeCents: 97_000_000,
  balanceCents: 85_050_000,
  availableBalanceCents: 85_050_000,
  byCategory: [
    {
      categoryId: 'a',
      name: 'Súper',
      color: '#064735',
      icon: 'ShoppingCart',
      amountCents: 3_824_000,
      percent: 32,
    },
    {
      categoryId: 'b',
      name: 'Comida',
      color: '#E5533D',
      icon: 'Utensils',
      amountCents: 2_868_000,
      percent: 24,
    },
  ],
}

function renderHome(
  summary: MonthSummary,
  _isPlus?: boolean,
  movements?: RecentMovement[],
  extra: Partial<Parameters<typeof HomeScreen>[0]> = {},
) {
  render(
    <MemoryRouter>
      <HomeScreen
        summary={summary}
        movements={movements}
        {...extra}
      />
    </MemoryRouter>,
  )
}

const movement = (id: string, occurredOn: string, note: string): RecentMovement => ({
  id,
  kind: 'expense',
  amountCents: 1_000_00,
  occurredOn,
  note,
  accountId: 'a',
  accountName: 'Efectivo',
  categoryName: 'Comida',
  categoryColor: '#E5533D',
  categoryIcon: 'Utensils',
})

describe('HomeScreen (Inicio)', () => {
  it('lists the newest movements under "Movimientos", with "Ver todos"', () => {
    renderHome(empty, false, [
      movement('m1', '2026-10-31', 'Cena'),
      movement('m2', '2026-09-30', 'Almuerzo'),
    ])
    const section = screen.getByRole('heading', { name: 'Movimientos' }).closest('section')
    expect(section).toHaveTextContent('Cena')
    expect(section).toHaveTextContent('Comida · Efectivo')
    expect(section).toHaveTextContent('Almuerzo')
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/actividad')
  })

  it('has one floating Moni, outside the page flow', () => {
    renderHome(withData)
    expect(screen.getAllByTestId('moni-agent')).toHaveLength(1)
  })

  it('without movements it says so honestly', () => {
    renderHome(empty)
    expect(screen.getByRole('heading', { name: 'Movimientos' })).toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay movimientos/)).toBeInTheDocument()
  })

  it('does not render sections the design does not have: totals, "En qué se fue", Hormigas, stories', () => {
    renderHome(withData, false, [movement('m1', '2026-10-31', 'Cena')])
    expect(screen.queryByRole('heading', { name: 'En qué se fue' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'Gastos por categoría' })).toBeNull()
    expect(screen.queryByText('Dinero disponible')).toBeNull()
    expect(screen.queryByRole('link', { name: /Hormigas/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Metas' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Tu resumen de hoy' })).toBeNull()
  })

  it('Inicio has no avatar or crown of its own, with or without Plus', () => {
    renderHome(withData, true)
    expect(screen.queryByRole('button', { name: /Moni Plus activo/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver Moni Plus' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Perfil' })).toBeNull()
  })

  it('keeps the order: hero, the three loading buttons, movements (the cat floats apart)', () => {
    renderHome(withData, false, [movement('m1', '2026-10-31', 'Cena')], {
      balance: { totalCents: 635_000_00, methodCount: 2, top: { name: 'Galicia', percent: 97 } },
    })
    const order = [
      screen.getByRole('region', { name: 'Lo que tenés' }),
      screen.getByRole('region', { name: 'Cargar un movimiento' }),
      screen.getByRole('heading', { name: 'Movimientos' }),
    ]
    order.slice(1).forEach((el, i) => {
      const before = order[i] as HTMLElement
      expect(before.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })
})
