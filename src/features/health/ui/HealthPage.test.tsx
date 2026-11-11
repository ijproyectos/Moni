import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { FinancialHealth } from '../api/useFinancialHealth'
import { computeHealthScore, healthSeries, suggestImprovement, type HealthMonthInput } from '../domain/healthScore'
import { HealthPage } from './HealthPage'

const state = vi.hoisted(() => ({ health: null as unknown, openNew: vi.fn() }))
vi.mock('../api/useFinancialHealth', () => ({ useFinancialHealth: () => state.health }))
vi.mock('@/features/transactions/ui/movementSheetContext', () => ({
  useMovementSheet: () => ({ openNew: state.openNew, openEdit: vi.fn() }),
}))

const input: HealthMonthInput = {
  month: '2026-11-01',
  incomeCents: 1_000_000_00,
  expenseCents: 910_000_00,
  installmentsCents: null,
  fixedCents: 370_000_00,
  budgetCompliance: 0.9,
}

function build(over: Partial<FinancialHealth> = {}): FinancialHealth {
  const months = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']
  const series = healthSeries(months.map((m) => ({ ...input, month: m })))
  return {
    isLoading: false,
    current: input,
    score: computeHealthScore(input),
    series,
    delta: 4,
    suggestion: suggestImprovement(input),
    ...over,
  }
}

function setup() {
  render(
    <MemoryRouter>
      <HealthPage />
    </MemoryRouter>,
  )
}

describe('HealthPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-15T15:00:00-03:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the real score, delta, six months and four factors with a dash for missing data', () => {
    state.health = build()
    setup()
    const score = screen.getByRole('region', { name: 'Puntaje' })
    expect(score).toHaveTextContent('de 100')
    expect(score).toHaveTextContent('+4 puntos vs octubre')
    expect(screen.getByRole('img', { name: /Evolución de los últimos 6 meses/ })).toBeInTheDocument()
    const factors = screen.getByRole('list', { name: 'Factores' })
    expect(factors.querySelectorAll('li')).toHaveLength(4)
    expect(factors).toHaveTextContent('Tasa de ahorro · meta 15%')
    expect(factors).toHaveTextContent('Cuotas sobre ingresos · sano ≤20%—')
    expect(factors).toHaveTextContent('Fijos sobre ingresos · sano ≤35%37%Ajustado')
  })

  it('hides the delta when the previous month cannot be scored', () => {
    state.health = build({ delta: null })
    setup()
    expect(screen.queryByText(/vs octubre/)).toBeNull()
  })

  it('suggests setting money aside from the real numbers', () => {
    state.health = build()
    setup()
    const tip = screen.getByRole('region', { name: 'Sugerencia' })
    expect(tip).toHaveTextContent('Separá $30.000 el día que cobrás')
    expect(tip).toHaveTextContent('Tu ahorro pasa de 9% a 12%')
  })

  it('is honest without income and leads to loading one', async () => {
    state.health = build({ score: { kind: 'sin-datos' }, suggestion: null, delta: null })
    setup()
    expect(screen.queryByText('de 100')).toBeNull()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole('button', { name: 'Cargar un ingreso' }),
    )
    expect(state.openNew).toHaveBeenCalledWith('income')
  })
})
