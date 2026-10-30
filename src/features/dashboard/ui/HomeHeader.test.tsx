import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  HIDDEN_AMOUNTS_STORAGE_KEY,
  HiddenAmountsProvider,
} from '@/shared/ui/HiddenAmountsProvider'
import { HomeHeader } from './HomeHeader'

function renderHeader(over: Partial<Parameters<typeof HomeHeader>[0]> = {}) {
  render(
    <MemoryRouter>
      <HiddenAmountsProvider>
        <HomeHeader
          month="2026-10-01"
          latestMonth="2026-10-01"
          onMonthChange={vi.fn()}
          initial="I"
          availableCents={568_000_00}
          balanceCents={-12_500_00}
          incomeCents={100_000_00}
          expenseCents={112_500_00}
          {...over}
        />
      </HiddenAmountsProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('HomeHeader: only two financial indicators', () => {
  // The eye button persists its choice; every test starts with the amounts visible.
  beforeEach(() => window.localStorage.removeItem(HIDDEN_AMOUNTS_STORAGE_KEY))

  it('shows "Dinero disponible" with the available money and what it includes', () => {
    renderHeader()
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).toHaveTextContent('Dinero disponible')
    expect(link).toHaveTextContent('568.000')
    expect(link).toHaveAttribute('href', '/cuentas')
    // Only the title and the amount: no explanatory line under it.
    expect(link).not.toHaveTextContent(/efectivo|billeteras|tarjetas|metas/i)
    expect(link.querySelectorAll('p')).toHaveLength(2)
  })

  it('shows "Balance del mes" with income and expenses underneath, labelled', () => {
    renderHeader()
    const section = screen.getByRole('region', { name: 'Balance del mes' })
    expect(within(section).getByRole('link', { name: 'Ver el informe del mes' })).toHaveTextContent(
      '-$12.500',
    )
    const group = within(section).getByRole('group', { name: 'Gastos e ingresos del mes' })
    expect(group).toHaveTextContent('-$112.500')
    expect(group).toHaveTextContent('+$100.000')
    expect(section).toHaveTextContent('Gastos')
    expect(section).toHaveTextContent('Ingresos')
  })

  it('a positive balance shows a plus sign', () => {
    renderHeader({ balanceCents: 30_000_00 })
    expect(screen.getByRole('link', { name: 'Ver el informe del mes' })).toHaveTextContent(
      '+$30.000',
    )
  })

  it('the available money does not depend on the month: it is what you have now', () => {
    renderHeader({
      month: '2026-08-01',
      balanceCents: 5_000_00,
      incomeCents: 5_000_00,
      expenseCents: 0,
    })
    expect(screen.getByRole('link', { name: 'Ver tus medios de pago' })).toHaveTextContent(
      '568.000',
    )
  })

  it('hides every amount with the eye button', async () => {
    const user = renderHeader()
    await user.click(screen.getByRole('button', { name: 'Ocultar montos' }))
    expect(screen.queryByText('568.000')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mostrar montos' })).toBeInTheDocument()
  })

  it('adds no other financial figure to the header: exactly four amounts (available, balance, expenses, income)', () => {
    renderHeader()
    const header = screen.getByRole('banner')
    const amounts = (header.textContent ?? '').match(/\d{1,3}(?:\.\d{3})+/g) ?? []
    expect(amounts.sort()).toEqual(['100.000', '112.500', '12.500', '568.000'])
    expect(screen.getAllByRole('region')).toHaveLength(1)
  })
})
