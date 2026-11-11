import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  HIDDEN_AMOUNTS_STORAGE_KEY,
  HiddenAmountsProvider,
} from '@/shared/ui/HiddenAmountsProvider'
import { MonthTotalsCard } from './MonthTotalsCard'

function renderCard(over: Partial<Parameters<typeof MonthTotalsCard>[0]> = {}) {
  render(
    <MemoryRouter>
      <HiddenAmountsProvider>
        <MonthTotalsCard
          availableCents={568_000_00}
          incomeCents={100_000_00}
          expenseCents={112_500_00}
          {...over}
        />
      </HiddenAmountsProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('MonthTotalsCard: Dinero disponible + Gastos e Ingresos', () => {
  // The eye button persists its choice; every test starts with the amounts visible.
  beforeEach(() => window.localStorage.removeItem(HIDDEN_AMOUNTS_STORAGE_KEY))

  it('shows "Dinero disponible" with the available money and what it includes', () => {
    renderCard()
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).toHaveTextContent('Dinero disponible')
    expect(link).toHaveTextContent('568.000')
    expect(link).toHaveAttribute('href', '/cuentas')
    // Only the title and the amount: no explanatory line under it.
    expect(link).not.toHaveTextContent(/efectivo|billeteras|tarjetas|metas/i)
    expect(link.querySelectorAll('p')).toHaveLength(2)
  })

  describe('Gastos and Ingresos chips adapt to long amounts', () => {
    const chips = () => ({
      expense: screen
        .getByRole('link', { name: /Gastos del mes/ })
        .querySelector('[data-amount]') as HTMLElement,
      income: screen
        .getByRole('link', { name: /Ingresos del mes/ })
        .querySelector('[data-amount]') as HTMLElement,
    })

    it('never wraps the amount (the minus sign stays glued to it) and sizes each chip to its text', () => {
      renderCard({ expenseCents: 292_087_89, incomeCents: 4_000_000_00 })
      const { expense, income } = chips()
      for (const chip of [expense, income]) {
        expect(chip).toHaveClass('whitespace-nowrap')
      }
      for (const link of [
        screen.getByRole('link', { name: /Gastos del mes/ }),
        screen.getByRole('link', { name: /Ingresos del mes/ }),
      ]) {
        // Content-sized (not `basis-0`): a small amount next to a big one must not get squeezed under its own text.
        expect(link).toHaveClass('basis-auto', 'min-w-fit')
        expect(link).not.toHaveClass('basis-0')
      }
      expect(expense).toHaveTextContent('-$292.087,89')
    })

    it('keeps the regular size for short amounts and shrinks BOTH chips together for long ones', () => {
      renderCard({ expenseCents: 5_000_00, incomeCents: 10_000_00 })
      expect(chips().expense).toHaveClass('text-[22px]')
      expect(chips().income).toHaveClass('text-[22px]')
      cleanup()

      renderCard({ expenseCents: 123_456_789_00, incomeCents: 10_000_00 })
      const long = chips()
      expect(long.expense).not.toHaveClass('text-[22px]')
      // Same size on both so they read as a pair, even though only one amount is long.
      expect(long.income.className.match(/text-\[\d+px\]/)?.[0]).toBe(
        long.expense.className.match(/text-\[\d+px\]/)?.[0],
      )
    })
  })

  it('shows a negative available money with its minus sign and in the warning color', () => {
    renderCard({ availableCents: -1_250_00 })
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).toHaveTextContent(/-\$\s*1\.250/)
    expect(link.querySelectorAll('p')[1]).toHaveClass('text-expense')
  })

  it('does not reveal a negative balance (minus sign or warning color) while amounts are hidden', async () => {
    const user = renderCard({ availableCents: -1_250_00 })
    await user.click(screen.getByRole('button', { name: 'Ocultar montos' }))
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).not.toHaveTextContent('-')
    expect(link.querySelectorAll('p')[1]).not.toHaveClass('text-expense')
  })

  it('shows a positive available money without a minus sign', () => {
    renderCard({ availableCents: 5_000_00 })
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).not.toHaveTextContent('-')
    expect(link.querySelectorAll('p')[1]).not.toHaveClass('text-expense')
  })

  it('no longer shows "Balance del mes" nor its amount; only Gastos and Ingresos stay', () => {
    renderCard()
    expect(screen.queryByText('Balance del mes')).toBeNull()
    expect(screen.queryByText('12.500')).toBeNull()
    const group = screen.getByRole('group', { name: 'Gastos e ingresos del mes' })
    expect(group).toHaveTextContent('-$112.500')
    expect(group).toHaveTextContent('+$100.000')
    expect(group).toHaveTextContent('Gastos')
    expect(group).toHaveTextContent('Ingresos')
  })

  it('Gastos and Ingresos open the month report (the access the balance used to give)', () => {
    renderCard()
    expect(screen.getByRole('link', { name: 'Gastos del mes, ver el informe' })).toHaveAttribute(
      'href',
      '/este-mes',
    )
    expect(screen.getByRole('link', { name: 'Ingresos del mes, ver el informe' })).toHaveAttribute(
      'href',
      '/este-mes',
    )
  })

  it('the available money is what you have now, whatever the month totals say', () => {
    renderCard({
      incomeCents: 5_000_00,
      expenseCents: 0,
    })
    expect(screen.getByRole('link', { name: 'Ver tus medios de pago' })).toHaveTextContent(
      '568.000',
    )
  })

  it('hides every amount with the eye button', async () => {
    const user = renderCard()
    await user.click(screen.getByRole('button', { name: 'Ocultar montos' }))
    expect(screen.queryByText('568.000')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mostrar montos' })).toBeInTheDocument()
  })

  it('shows exactly three amounts: available, expenses and income', () => {
    renderCard()
    const header = screen.getByRole('region', { name: 'Resumen de tu dinero' })
    const amounts = (header.textContent ?? '').match(/\d{1,3}(?:\.\d{3})+/g) ?? []
    expect(amounts.sort()).toEqual(['100.000', '112.500', '568.000'])
  })
})
