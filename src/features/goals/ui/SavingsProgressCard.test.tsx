import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { PlanData } from '../domain/savingsPlan'
import { makeGoal, makeSavings } from '../domain/testing'
import { SavingsProgressCard } from './SavingsProgressCard'
import { swipeShift } from './chartMonths'

const state = vi.hoisted(() => ({
  plan: { isLoading: false, isError: false, data: undefined as unknown },
}))
vi.mock('../api/useSavings', () => ({ useSavingsPlanData: () => state.plan }))

const life = (createdAt = '2026-08-10T12:00:00Z') => ({
  createdAt,
  completedAt: null,
  archivedAt: null,
  pausedAt: null,
})
const row = (goalId: string, month: string, dep: number, wd = 0) => ({
  goalId,
  month,
  depositedCents: dep * 100,
  withdrawnCents: wd * 100,
  releasedCents: 0,
})

// Computadora: 1.200.000 for January 2027, 330.000 reserved. Casa: 1.500.000 for May 2027, nothing reserved.
const computadora = makeGoal({
  id: 'g1',
  name: 'Computadora',
  targetCents: 1_200_000_00,
  reservedCents: 330_000_00,
  targetDate: '2027-01-31',
})
const casa = makeGoal({
  id: 'g2',
  name: 'Casa',
  targetCents: 1_500_000_00,
  reservedCents: 0,
  targetDate: '2027-05-31',
})

function setup(
  goals = [computadora, casa],
  data: PlanData = {
    months: [
      row('g1', '2026-09-01', 100_000),
      row('g1', '2026-10-01', 130_000, 20_000),
      row('g1', '2026-11-01', 120_000),
    ],
    lives: { g1: life(), g2: life('2026-11-02T10:00:00Z') },
  },
  today = '2026-11-15',
) {
  state.plan = { isLoading: false, isError: false, data }
  const view = render(
    <MemoryRouter>
      <SavingsProgressCard overview={makeSavings({ today, goals })} />
    </MemoryRouter>,
  )
  return {
    ...view,
    user: userEvent.setup(),
    rerenderWith: (g: typeof goals) =>
      view.rerender(
        <MemoryRouter>
          <SavingsProgressCard overview={makeSavings({ today, goals: g })} />
        </MemoryRouter>,
      ),
  }
}
const columns = () => screen.getAllByRole('button', { name: /: ahorrado .*necesario/ })
const monthLabels = () => columns().map((c) => c.textContent?.replace(/\d{4}$/, '').trim())
const detail = () => screen.getByRole('status')

describe('Tu progreso en metas: the plan', () => {
  it('replaces the percentage circle with what to save per month, from the real goals and dates', () => {
    setup()
    expect(screen.getByText('Para alcanzar tus metas')).toBeInTheDocument()
    // Computadora asks (1.200.000 - 100.000 + ... ) / 3 months; Casa 1.500.000 / 7 months.
    expect(screen.getByText(/por mes/)).toBeInTheDocument()
    expect(screen.getByText(/Según tus fechas objetivo/)).toBeInTheDocument()
    expect(screen.queryByText(/\d+%/)).toBeNull()
  })

  it('lists the plan month by month: it is higher while the early goal lasts and drops after it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Ver el plan mes a mes/ }))
    const items = within(screen.getByRole('list', { name: 'Plan mes a mes' })).getAllByRole(
      'listitem',
    )
    expect(items.length).toBeGreaterThanOrEqual(2)
    const amount = (el: HTMLElement | undefined) =>
      Number(el?.textContent?.match(/\$([\d.]+)/)?.[1]?.replaceAll('.', ''))
    expect(items[0]).toHaveTextContent(/nov 2026/i)
    expect(items[items.length - 1]).toHaveTextContent(/feb – may 2027/i)
    expect(amount(items[0])).toBeGreaterThan(amount(items[items.length - 1]))
  })
})

describe('the chart: a window of six months that moves', () => {
  it('opens around today: two months back, the current month highlighted and three ahead', () => {
    setup()
    expect(monthLabels()).toEqual(['sep', 'oct', 'nov', 'dic', 'ene', 'feb'])
    expect(
      screen.getByRole('button', { name: /Noviembre 2026 \(mes actual\)/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\(mes actual\)/ })).toHaveLength(1)
  })

  it('shows the legend: saved, needed and projection', () => {
    setup()
    const legend = screen.getByRole('list', { name: 'Referencias' })
    expect(legend).toHaveTextContent('Ahorrado')
    expect(legend).toHaveTextContent('Necesario')
    expect(legend).toHaveTextContent('Proyección')
  })

  it('goes forward and back, across the end of the year, updating months and years', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Meses siguientes' }))
    expect(monthLabels()).toEqual(['dic', 'ene', 'feb', 'mar', 'abr', 'may'])
    expect(screen.getByText(/dic 2026 – may 2027/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Meses anteriores' }))
    await user.click(screen.getByRole('button', { name: 'Meses anteriores' }))
    expect(monthLabels()).toEqual(['jun', 'jul', 'ago', 'sep', 'oct', 'nov'])
    expect(screen.getByText(/jun 2026 – nov 2026/i)).toBeInTheDocument()
  })

  it('shows the year at January so the change of year is never ambiguous', async () => {
    const { user } = setup()
    expect(
      within(screen.getByRole('button', { name: /Enero 2027/ })).getByText('2027'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Meses siguientes' }))
    expect(
      within(screen.getByRole('button', { name: /Enero 2027/ })).getByText('2027'),
    ).toBeInTheDocument()
  })

  it('can go far into the past and the future (it is not limited to the first six months)', async () => {
    const { user } = setup()
    for (let i = 0; i < 12; i++)
      await user.click(screen.getByRole('button', { name: 'Meses siguientes' }))
    expect(screen.getByText(/sep 2029 – feb 2030/i)).toBeInTheDocument()
    for (let i = 0; i < 24; i++)
      await user.click(screen.getByRole('button', { name: 'Meses anteriores' }))
    expect(screen.getByText(/sep 2023 – feb 2024/i)).toBeInTheDocument()
    expect(columns()).toHaveLength(6)
  })

  it('"Volver a hoy" only shows when today is out of view, and brings it back with November selected', async () => {
    const { user } = setup()
    expect(screen.queryByRole('button', { name: 'Volver a hoy' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Meses siguientes' }))
    await user.click(screen.getByRole('button', { name: 'Meses siguientes' }))
    await user.click(screen.getByRole('button', { name: 'Volver a hoy' }))
    expect(monthLabels()).toEqual(['sep', 'oct', 'nov', 'dic', 'ene', 'feb'])
    expect(screen.queryByRole('button', { name: 'Volver a hoy' })).toBeNull()
    expect(detail()).toHaveTextContent('Noviembre 2026')
  })

  it('navigating does not change the goals or the money (only the period being looked at)', async () => {
    const { user } = setup()
    const before = screen.getByText(/por mes/).parentElement?.textContent
    await user.click(screen.getByRole('button', { name: 'Meses siguientes' }))
    await user.click(screen.getByRole('button', { name: 'Meses anteriores' }))
    expect(screen.getByText(/por mes/).parentElement?.textContent).toBe(before)
  })

  it('the keyboard moves between months: arrows select and scroll the window, Home goes to today', async () => {
    const { user } = setup()
    const nov = screen.getByRole('button', { name: /Noviembre 2026/ })
    nov.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(detail()).toHaveTextContent('Enero 2027')
    await user.keyboard('{ArrowRight}')
    expect(detail()).toHaveTextContent('Febrero 2027')
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(monthLabels()).toContain('abr')
    await user.keyboard('{Home}')
    expect(detail()).toHaveTextContent('Noviembre 2026')
    await user.keyboard('{PageDown}')
    expect(monthLabels()[0]).toBe('sep')
  })

  it('a swipe to the left shows later months and to the right earlier ones (mouse drag and finger)', () => {
    expect(swipeShift(-180, 60)).toBe(3)
    expect(swipeShift(120, 60)).toBe(-2)
    expect(swipeShift(20, 60)).toBe(0)
    expect(swipeShift(-35, 60)).toBe(1)
    expect(swipeShift(-100, 0)).toBe(0)
  })

  it('a drag over the chart moves the window; a plain tap only selects', () => {
    setup()
    const plot = screen.getByRole('group', { name: /Ahorro por mes/ })
    // jsdom has no layout: the plot is 0 px wide, so one pointer unit stands for one column here.
    Object.defineProperty(plot, 'clientWidth', { value: 360, configurable: true })
    fireEvent.pointerDown(plot, {
      clientX: 300,
      clientY: 50,
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
    })
    fireEvent.pointerMove(plot, { clientX: 180, clientY: 52, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(plot, { clientX: 180, clientY: 52, pointerId: 1, pointerType: 'touch' })
    // 120 px to the left over 60 px columns: two months later.
    expect(monthLabels()).toEqual(['nov', 'dic', 'ene', 'feb', 'mar', 'abr'])
  })

  it('a mostly vertical gesture never moves the months (the page keeps scrolling)', () => {
    setup()
    const plot = screen.getByRole('group', { name: /Ahorro por mes/ })
    Object.defineProperty(plot, 'clientWidth', { value: 360, configurable: true })
    fireEvent.pointerDown(plot, {
      clientX: 200,
      clientY: 20,
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
    })
    fireEvent.pointerMove(plot, { clientX: 215, clientY: 140, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(plot, { clientX: 215, clientY: 140, pointerId: 1, pointerType: 'touch' })
    expect(monthLabels()).toEqual(['sep', 'oct', 'nov', 'dic', 'ene', 'feb'])
    expect(plot).toHaveStyle({ touchAction: 'pan-y' })
  })

  it('a trackpad swipe sideways moves the months, a vertical wheel does not', () => {
    setup()
    const plot = screen.getByRole('group', { name: /Ahorro por mes/ })
    fireEvent.wheel(plot, { deltaX: 130, deltaY: 4 })
    expect(monthLabels()).toEqual(['nov', 'dic', 'ene', 'feb', 'mar', 'abr'])
    fireEvent.wheel(plot, { deltaX: 2, deltaY: 200 })
    expect(monthLabels()).toEqual(['nov', 'dic', 'ene', 'feb', 'mar', 'abr'])
  })
})

describe('the detail of a month', () => {
  it('a closed month: month, year, what was saved, what was needed and what was missing', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Octubre 2026/ }))
    const box = detail()
    expect(box).toHaveTextContent('Octubre 2026')
    expect(box).toHaveTextContent('Ahorrado')
    expect(box).toHaveTextContent('$110.000') // 130.000 deposited - 20.000 withdrawn
    expect(box).toHaveTextContent('Necesario')
    expect(box).toHaveTextContent('$275.000')
    expect(box).toHaveTextContent('Te faltaron $165.000')
  })

  it('the current month says it is still open', () => {
    setup()
    expect(detail()).toHaveTextContent('Noviembre 2026')
    expect(detail()).toHaveTextContent('este mes')
    expect(detail()).toHaveTextContent(/Te faltan \$/)
  })

  it('a future month is labelled as a projection and has no invented savings', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Febrero 2027/ }))
    expect(detail()).toHaveTextContent('proyección')
    expect(detail()).not.toHaveTextContent('Ahorrado')
    expect(detail()).toHaveTextContent('todavía no hay aportes')
  })

  it('a month before the goals existed says so instead of inventing numbers', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Meses anteriores' }))
    await user.click(screen.getByRole('button', { name: 'Meses anteriores' }))
    await user.click(screen.getByRole('button', { name: /Julio 2026/ }))
    expect(detail()).toHaveTextContent('Todavía no tenías metas este mes')
  })

  it('a month that met the plan says so and how much was extra', async () => {
    const { user } = setup(
      [
        makeGoal({
          id: 'g1',
          targetCents: 100_000_00,
          reservedCents: 100_000_00,
          targetDate: '2026-11-30',
        }),
      ],
      {
        months: [row('g1', '2026-10-01', 60_000), row('g1', '2026-11-01', 40_000)],
        lives: { g1: life() },
      },
    )
    await user.click(screen.getByRole('button', { name: /Octubre 2026/ }))
    expect(detail()).toHaveTextContent(/Cumpliste/)
  })

  it('selecting a month also works with the keyboard (it is a real button)', async () => {
    const { user } = setup()
    const oct = screen.getByRole('button', { name: /Octubre 2026/ })
    oct.focus()
    await user.keyboard('{Enter}')
    expect(oct).toHaveAttribute('aria-pressed', 'true')
    expect(detail()).toHaveTextContent('Octubre 2026')
  })
})

describe('status and advice follow the real data', () => {
  it('"Vas al día" only when the month already meets the plan', () => {
    setup(
      [
        makeGoal({
          id: 'g1',
          targetCents: 1_200_000_00,
          reservedCents: 400_000_00,
          targetDate: '2027-01-31',
        }),
      ],
      {
        months: [row('g1', '2026-11-01', 400_000)],
        lives: { g1: life('2026-11-01T10:00:00Z') },
      },
    )
    expect(screen.getByText('Vas al día')).toBeInTheDocument()
    expect(screen.getByText('¡Cumpliste tu objetivo de ahorro de este mes!')).toBeInTheDocument()
  })

  it('does not say it when the person is behind', () => {
    setup()
    expect(screen.queryByText('Vas al día')).toBeNull()
    expect(
      screen.getByText(/Necesitás ahorrar un poco más|Todavía estás a tiempo/),
    ).toBeInTheDocument()
  })

  it('a goal with little time and much missing needs attention, and the advice names it', () => {
    setup(
      [
        makeGoal({
          id: 'g1',
          name: 'Casa',
          targetCents: 1_000_000_00,
          reservedCents: 200_000_00,
          targetDate: '2026-12-31',
        }),
      ],
      {
        months: [row('g1', '2026-10-01', 200_000)],
        lives: { g1: life() },
      },
    )
    expect(screen.getByText('Tu meta necesita atención')).toBeInTheDocument()
    expect(screen.getByText(/Tu meta Casa necesita atención/)).toBeInTheDocument()
  })

  it('the advice links to the goal it is about', () => {
    setup(
      [
        makeGoal({
          id: 'g1',
          name: 'Casa',
          targetCents: 1_000_000_00,
          reservedCents: 200_000_00,
          targetDate: '2026-12-31',
        }),
      ],
      {
        months: [row('g1', '2026-10-01', 200_000)],
        lives: { g1: life() },
      },
    )
    expect(screen.getByRole('link', { name: 'Ver mi plan de ahorro' })).toHaveAttribute(
      'href',
      '/metas/g1',
    )
  })

  it('an expired goal and a goal without date are explained, not calculated', () => {
    setup(
      [makeGoal({ id: 'g1', name: 'Vieja', targetDate: '2026-08-31', reservedCents: 10_000_00 })],
      { months: [], lives: { g1: life() } },
    )
    expect(screen.getByText(/ya vencieron: cambiá la fecha/)).toBeInTheDocument()
    expect(screen.queryByText(/\$[\d.,]+ por mes/)).toBeNull()
  })

  it('a goal reached shows "Meta cumplida"', () => {
    setup(
      [
        makeGoal({
          id: 'g1',
          targetCents: 100_000_00,
          reservedCents: 100_000_00,
          targetDate: '2027-01-31',
        }),
      ],
      { months: [row('g1', '2026-10-01', 100_000)], lives: { g1: life() } },
    )
    expect(screen.getByText('Meta cumplida')).toBeInTheDocument()
  })

  it('updates when the goals change', () => {
    const { rerenderWith } = setup([computadora], {
      months: [],
      lives: { g1: life('2026-11-02T10:00:00Z'), g2: life('2026-11-02T10:00:00Z') },
    })
    const headline = () => document.querySelector('p.font-display')?.textContent
    const before = headline()
    rerenderWith([computadora, casa])
    expect(headline()).not.toBe(before)
  })
})

describe('empty and error states', () => {
  it('shows a message while the history loads and when it cannot be loaded', () => {
    state.plan = { isLoading: false, isError: true, data: undefined }
    render(
      <MemoryRouter>
        <SavingsProgressCard
          overview={makeSavings({ today: '2026-11-15', goals: [computadora] })}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/No pudimos cargar el historial/)).toBeInTheDocument()
  })

  it('with no goals it explains what will appear, without a chart', () => {
    setup([], { months: [], lives: {} })
    expect(screen.queryByRole('group', { name: /Ahorro por mes/ })).toBeNull()
    expect(screen.getByText(/Creá una meta con fecha/)).toBeInTheDocument()
  })
})
