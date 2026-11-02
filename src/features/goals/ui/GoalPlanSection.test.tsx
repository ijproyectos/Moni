import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeGoal, makeSavings } from '../domain/testing'
import { GoalPlanSection } from './GoalPlanSection'

const state = vi.hoisted(() => ({
  data: { months: [] as unknown[], lives: {} as Record<string, unknown> } as unknown,
}))
vi.mock('../api/useSavings', () => ({
  useSavingsPlanData: () => ({ isLoading: false, isError: false, data: state.data }),
}))

const row = (month: string, dep: number) => ({
  goalId: 'g1',
  month,
  depositedCents: dep * 100,
  withdrawnCents: 0,
  releasedCents: 0,
})
const life = {
  createdAt: '2026-08-10T12:00:00Z',
  completedAt: null,
  archivedAt: null,
  pausedAt: null,
}
const goal = (over = {}) =>
  makeGoal({
    id: 'g1',
    targetCents: 1_200_000_00,
    reservedCents: 200_000_00,
    targetDate: '2027-01-31',
    ...over,
  })

function setup(g = goal(), months: unknown[] = [row('2026-10-01', 200_000)]) {
  state.data = { months, lives: { g1: life } }
  render(<GoalPlanSection goal={g} overview={makeSavings({ today: '2026-11-15', goals: [g] })} />)
  return userEvent.setup()
}

describe('Plan de ahorro de una meta', () => {
  it('shows what is missing, the target date and the monthly amount needed', () => {
    setup()
    expect(screen.getByText('Falta ahorrar').nextSibling).toHaveTextContent('$1.000.000')
    expect(screen.getByText('Fecha objetivo').nextSibling).toHaveTextContent('ene de 2027')
    expect(screen.getByText('Ahorro mensual necesario').nextSibling).toHaveTextContent(
      '$333.333,34',
    )
    expect(screen.getByText(/Quedan 3 meses/)).toBeInTheDocument()
  })

  it('shows the real average of the last months', () => {
    setup(goal(), [row('2026-09-01', 100_000), row('2026-10-01', 200_000)])
    expect(screen.getByText(/en promedio \$150\.000 por mes/)).toBeInTheDocument()
  })

  it('an expired goal, a goal without date and a reached goal are explained', () => {
    setup(goal({ targetDate: '2026-08-31' }))
    expect(screen.getByText(/La fecha objetivo ya pasó/)).toBeInTheDocument()
    expect(screen.queryByText('Ahorro mensual necesario')).toBeNull()
  })

  it('a goal without date asks for one', () => {
    setup(goal({ targetDate: null }))
    expect(screen.getByText(/no tiene fecha objetivo/)).toBeInTheDocument()
  })

  it('a reached goal congratulates and offers no simulator', () => {
    setup(goal({ reservedCents: 1_200_000_00 }))
    expect(screen.getByText(/Llegaste al monto de tu meta/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Ahorro mensual a simular')).toBeNull()
  })
})

describe('Simulador', () => {
  it('says when the goal would be reached and whether that is on time, without touching the goal', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Ahorro mensual a simular'), '500000')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Con $500.000 por mes llegarías en dic de 2026',
    )
    expect(screen.getByRole('status')).toHaveTextContent('a tiempo')
  })

  it('a smaller amount arrives later than the target date', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Ahorro mensual a simular'), '250000')
    expect(screen.getByRole('status')).toHaveTextContent('feb de 2027')
    expect(screen.getByRole('status')).toHaveTextContent('1 mes después de tu fecha objetivo')
  })

  it('the quick buttons fill the needed amount and the average', async () => {
    const user = setup(goal(), [row('2026-10-01', 80_000)])
    await user.click(screen.getByRole('button', { name: /Lo necesario/ }))
    expect(screen.getByLabelText('Ahorro mensual a simular')).toHaveValue('373.333,34')
    await user.click(screen.getByRole('button', { name: /Mi promedio: \$80\.000/ }))
    expect(screen.getByLabelText('Ahorro mensual a simular')).toHaveValue('80.000')
    expect(screen.getByRole('status')).toHaveTextContent('nov de 2027')
  })

  it('an amount of zero simulates nothing and shows nothing', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Ahorro mensual a simular'), '0')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('without a date it only estimates', async () => {
    const user = setup(goal({ targetDate: null }))
    await user.type(screen.getByLabelText('Ahorro mensual a simular'), '100000')
    expect(screen.getByRole('status')).toHaveTextContent('Con $100.000 por mes llegarías en')
    expect(screen.getByRole('status')).not.toHaveTextContent('a tiempo')
  })
})
