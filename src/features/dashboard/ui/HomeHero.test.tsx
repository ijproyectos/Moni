import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DailyAllowanceView } from '../api/useDailyAllowance'
import { dailyAllowance } from '../domain/dailyAllowance'
import { dayStatus, monthPace } from '../domain/monthPace'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
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

function setup(v: DailyAllowanceView, onAddIncome = vi.fn(), balance = { totalCents: 550_553_00, methodCount: 5 }) {
  render(
    <HiddenAmountsProvider>
      <HomeHero view={v} balance={balance} onAddIncome={onAddIncome} />
    </HiddenAmountsProvider>,
  )
  return { onAddIncome, hero: screen.getByRole('region', { name: 'Lo que tenés' }) }
}

describe('HomeHero', () => {
  it('shows the real total and the number of payment methods', () => {
    setup(view(100_000_00))
    expect(screen.getByTestId('hero-figure')).toHaveTextContent('$550.553')
    expect(screen.getByText('repartido en 5 medios de pago')).toBeInTheDocument()
  })

  it('says "medio de pago" in singular', () => {
    setup(view(100_000_00), vi.fn(), { totalCents: 1000_00, methodCount: 1 })
    expect(screen.getByText('repartido en 1 medio de pago')).toBeInTheDocument()
  })

  it('vas bien: the chip carries the allowance of the day and the state', () => {
    // Budget 800.000 over 30 days; 100.000 spent by day 11 -> 700.000 / 20 days left = 35.000.
    const { hero } = setup(view(100_000_00))
    expect(hero).toHaveTextContent('Hoy podés gastar $35.000 · Vas bien')
  })

  it('te pasaste: the chip names the amount over budget', () => {
    const { hero } = setup(view(1_200_000_00))
    expect(within(hero).getByText(/Pasaste tu presupuesto por/)).toBeInTheDocument()
    expect(within(hero).getByText(/Te pasaste/)).toBeInTheDocument()
  })

  it('"Ocultar" hides the amounts and the button turns into "Mostrar"', async () => {
    const { hero } = setup(view(100_000_00))
    await userEvent.click(within(hero).getByRole('button', { name: 'Ocultar montos' }))
    expect(within(hero).getByRole('button', { name: 'Mostrar montos' })).toBeInTheDocument()
  })

  it('sin datos: invents no allowance and leads to loading income', async () => {
    const { hero, onAddIncome } = setup({
      isLoading: false,
      allowance: { kind: 'sin-datos' },
      status: null,
      pace: null,
    })
    expect(within(hero).queryByText(/Hoy podés gastar/)).not.toBeInTheDocument()
    await userEvent.click(within(hero).getByRole('button', { name: 'Cargar ingresos' }))
    expect(onAddIncome).toHaveBeenCalledOnce()
  })

  it('while loading without data it shows a placeholder, not the empty action', () => {
    setup({ isLoading: true, allowance: { kind: 'sin-datos' }, status: null, pace: null })
    expect(screen.getByRole('status', { name: 'Calculando tu día' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar ingresos' })).not.toBeInTheDocument()
  })
})
