import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { AntExpenses } from '../domain/ants'
import { AntsPage } from './AntsPage'

const state = vi.hoisted(() => ({
  byMonth: {} as Record<string, unknown>,
  weekdays: null as number[] | null,
}))

vi.mock('../api/useAnts', () => ({
  useAnts: (month: string) => state.byMonth[month] ?? { isLoading: true },
}))
vi.mock('../api/useAntWeekdays', () => ({ useAntWeekdays: () => state.weekdays }))

function ants(total: number, withGroup = true): AntExpenses {
  return {
    month: '2026-10-01',
    thresholdCents: 1_000_000,
    monthTotalCents: total,
    shareOfExpenses: 2.9,
    groups: withGroup
      ? [
          {
            categoryId: 'c1',
            categoryName: 'Comida',
            color: '#E5533D',
            icon: 'Utensils',
            label: 'Cafe',
            count: 3,
            totalCents: total,
            averageCents: total / 3,
            yearlyProjectionCents: total * 12,
          },
        ]
      : [],
  }
}

function renderPage() {
  render(
    <MemoryRouter>
      <AntsPage />
    </MemoryRouter>,
  )
}

describe('AntsPage', () => {
  afterEach(() => {
    state.byMonth = {}
    state.weekdays = null
  })

  it('shows the loading state', () => {
    renderPage()
    expect(screen.getByRole('status', { name: 'Cargando gastos hormiga' })).toBeInTheDocument()
  })

  it('shows an error with retry', () => {
    const refetch = vi.fn()
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'))
    state.byMonth['2026-10-01'] = { isError: true, refetch }
    renderPage()
    expect(screen.getByText('No pudimos cargar tus gastos hormiga')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows the real groups, the dynamic threshold and the change against last month', () => {
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'))
    state.byMonth['2026-10-01'] = { data: ants(900_000) }
    state.byMonth['2026-09-01'] = { data: ants(600_000) }
    renderPage()
    expect(screen.getByText('Cafe')).toBeInTheDocument()
    expect(screen.getByText('3 veces este mes')).toBeInTheDocument()
    expect(screen.getByText(/Gastos de hasta \$10\.000/)).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: 'Resumen' })
    expect(hero).toHaveTextContent('Cafe, al año')
    expect(hero).toHaveTextContent('$108.000')
    expect(hero).toHaveTextContent('+50% vs mes anterior')
    vi.useRealTimers()
  })

  it('draws the weekdays from the movements and the advice from the real projection', () => {
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'))
    state.byMonth['2026-10-01'] = { data: { ...ants(900_000), groups: ants(900_000).groups.map((g) => ({ ...g, count: 10 })) } }
    state.byMonth['2026-09-01'] = { data: ants(600_000) }
    state.weekdays = [0, 1, 0, 4, 5, 0, 0]
    renderPage()
    expect(screen.getByText('Más jueves y viernes')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /J 4, V 5/ })).toBeInTheDocument()
    // 10 purchases in 28 days = 2.5 -> 3 per week, cut to 2: saves 1/3 of the yearly projection
    expect(screen.getByRole('region', { name: 'Consejo' })).toHaveTextContent('de 3 a 2 veces por semana')
    vi.useRealTimers()
  })

  it('shows no weekday card without weekday data', () => {
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'))
    state.byMonth['2026-10-01'] = { data: ants(900_000) }
    renderPage()
    expect(screen.queryByRole('region', { name: 'Cuándo pasan' })).toBeNull()
    vi.useRealTimers()
  })

  it('shows a friendly empty state and switches to last month', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'))
    state.byMonth['2026-10-01'] = { data: ants(0, false) }
    state.byMonth['2026-09-01'] = { data: ants(300_000) }
    renderPage()
    expect(screen.getByText('Sin hormigas por ahora')).toBeInTheDocument()
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('button', { name: 'Mes pasado' }))
    expect(screen.getByText('Cafe')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
