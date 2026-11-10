import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DailyAllowanceView } from '../api/useDailyAllowance'
import { dailyAllowance } from '../domain/dailyAllowance'
import { dayStatus, monthPace } from '../domain/monthPace'
import { HomeHero } from './HomeHero'

/** Builds the view the way the hook does, from the real domain. */
function view(spentCents: number, over: Partial<Parameters<typeof dailyAllowance>[0]> = {}) {
  const allowance = dailyAllowance({
    today: '2026-11-11',
    expectedIncomeCents: 1_000_000_00,
    pendingFixedCents: 200_000_00,
    pendingSubscriptionsCents: 0,
    pendingInstallmentsCents: 0,
    goalsCents: 0,
    spentCents,
    ...over,
  })
  return {
    isLoading: false,
    allowance,
    status: dayStatus(allowance),
    pace: allowance.kind === 'ok' ? monthPace(allowance) : null,
  } satisfies DailyAllowanceView
}

function setup(v: DailyAllowanceView, onAddIncome = vi.fn()) {
  render(<HomeHero view={v} onAddIncome={onAddIncome} />)
  return { onAddIncome, hero: screen.getByRole('region', { name: /Hoy podés gastar|Pasaste/ }) }
}

describe('HomeHero', () => {
  it('vas bien: the allowance of the day, the ok chip and the pace bar with the day marker', () => {
    // Budget 800.000 over 30 days; 100.000 spent by day 11 -> 700.000 / 20 days left = 35.000.
    const { hero } = setup(view(100_000_00))
    expect(within(hero).getByText('Hoy podés gastar')).toBeInTheDocument()
    expect(screen.getByTestId('hero-figure')).toHaveTextContent('$35.000')
    expect(within(hero).getByText('Vas bien').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'ok',
    )
    expect(hero).toHaveTextContent('por debajo de tu ritmo del mes')
    expect(
      screen.getByRole('img', { name: /Ritmo del mes: llevás gastado el 13% .* día 11 de 30/ }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('pace-marker')).toHaveStyle({ left: `${(11 / 30) * 100}%` })
  })

  it('the pace bar says how much was spent of the budget and which day of the month it is', () => {
    const { hero } = setup(view(100_000_00))
    expect(hero).toHaveTextContent('Gastado $100.000 de $800.000')
    expect(hero).toHaveTextContent('Ritmo · día 11 de 30')
  })

  it('ajustado: the warn chip and a context line that names the allowance', () => {
    // Spent 640.000 -> 160.000 / 20 = 8.000, under 70% of an even split (26.666).
    const { hero } = setup(view(640_000_00))
    expect(screen.getByTestId('hero-figure')).toHaveTextContent('$8.000')
    expect(within(hero).getByText('Ajustado').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warn',
    )
    expect(hero).toHaveTextContent('Con $8.000 hoy llegás')
  })

  it('te pasaste: a gentle bad chip, the amount over budget and no blaming copy', () => {
    const { hero } = setup(view(850_000_00))
    expect(within(hero).getByText('Te pasaste un poco').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'bad',
    )
    expect(within(hero).getByText('Pasaste tu presupuesto por')).toBeInTheDocument()
    expect(screen.getByTestId('hero-figure')).toHaveTextContent('$50.000')
    expect(hero).toHaveTextContent('Tranqui')
    expect(hero.textContent).not.toMatch(/culpa|mal|error/i)
  })

  it('shows the decimals smaller than the pesos', () => {
    setup(view(0, { expectedIncomeCents: 100_000_00 + 10 * 100 + 50, pendingFixedCents: 0 }))
    const figure = screen.getByTestId('hero-figure')
    expect(figure.querySelector('span')).toHaveClass('text-[0.55em]')
  })

  it('sin datos: says so, invents no figure and leads to loading income', async () => {
    const { onAddIncome } = setup(view(0, { expectedIncomeCents: null }))
    expect(screen.queryByTestId('hero-figure')).toBeNull()
    expect(screen.queryByText(/\$/)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cargar ingresos' }))
    expect(onAddIncome).toHaveBeenCalledTimes(1)
  })

  it('while loading without data it shows a placeholder, not the empty state', () => {
    render(
      <HomeHero
        view={{ isLoading: true, allowance: { kind: 'sin-datos' }, status: null, pace: null }}
        onAddIncome={vi.fn()}
      />,
    )
    expect(screen.getByRole('status', { name: 'Calculando tu día' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar ingresos' })).toBeNull()
  })
})
