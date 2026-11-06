import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { FEATURES } from '@/shared/config/features'
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
          initial="I"
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

describe('HomeHeader: Dinero disponible + Gastos e Ingresos', () => {
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
      renderHeader({ expenseCents: 292_087_89, incomeCents: 4_000_000_00 })
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
      renderHeader({ expenseCents: 5_000_00, incomeCents: 10_000_00 })
      expect(chips().expense).toHaveClass('text-[22px]')
      expect(chips().income).toHaveClass('text-[22px]')
      cleanup()

      renderHeader({ expenseCents: 123_456_789_00, incomeCents: 10_000_00 })
      const long = chips()
      expect(long.expense).not.toHaveClass('text-[22px]')
      // Same size on both so they read as a pair, even though only one amount is long.
      expect(long.income.className.match(/text-\[\d+px\]/)?.[0]).toBe(
        long.expense.className.match(/text-\[\d+px\]/)?.[0],
      )
    })
  })

  it('shows a negative available money with its minus sign and in the warning color', () => {
    renderHeader({ availableCents: -1_250_00 })
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).toHaveTextContent(/-\$\s*1\.250/)
    expect(link.querySelectorAll('p')[1]).toHaveClass('text-expense')
  })

  it('does not reveal a negative balance (minus sign or warning color) while amounts are hidden', async () => {
    const user = renderHeader({ availableCents: -1_250_00 })
    await user.click(screen.getByRole('button', { name: 'Ocultar montos' }))
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).not.toHaveTextContent('-')
    expect(link.querySelectorAll('p')[1]).not.toHaveClass('text-expense')
  })

  it('shows a positive available money without a minus sign', () => {
    renderHeader({ availableCents: 5_000_00 })
    const link = screen.getByRole('link', { name: 'Ver tus medios de pago' })
    expect(link).not.toHaveTextContent('-')
    expect(link.querySelectorAll('p')[1]).not.toHaveClass('text-expense')
  })

  it('no longer shows "Balance del mes" nor its amount; only Gastos and Ingresos stay', () => {
    renderHeader()
    expect(screen.queryByText('Balance del mes')).toBeNull()
    expect(screen.queryByText('12.500')).toBeNull()
    const group = screen.getByRole('group', { name: 'Gastos e ingresos del mes' })
    expect(group).toHaveTextContent('-$112.500')
    expect(group).toHaveTextContent('+$100.000')
    expect(group).toHaveTextContent('Gastos')
    expect(group).toHaveTextContent('Ingresos')
  })

  it('Gastos and Ingresos open the month report (the access the balance used to give)', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Gastos del mes, ver el informe' })).toHaveAttribute(
      'href',
      '/este-mes',
    )
    expect(screen.getByRole('link', { name: 'Ingresos del mes, ver el informe' })).toHaveAttribute(
      'href',
      '/este-mes',
    )
  })

  it('is a green gradient card (lighter fills in the dark theme) and greets the person by name', () => {
    renderHeader({ name: 'Iara' })
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('bg-gradient-to-br', 'from-forest', 'to-surface', 'dark:from-card')
    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Iara' })).toBeInTheDocument()
  })

  it('shows the chart it is given between the balance and the month totals', () => {
    renderHeader({ chart: <div data-testid="chart" /> })
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('the available money is what you have now, whatever the month totals say', () => {
    renderHeader({
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

  it('shows exactly three amounts: available, expenses and income', () => {
    renderHeader()
    const header = screen.getByRole('banner')
    const amounts = (header.textContent ?? '').match(/\d{1,3}(?:\.\d{3})+/g) ?? []
    expect(amounts.sort()).toEqual(['100.000', '112.500', '568.000'])
  })

  it('has no bell nor "Avisos" badge while notifications have no backend, even with reminders', () => {
    renderHeader({ reminderCount: 4 })
    expect(screen.queryByRole('link', { name: /Avisos/ })).toBeNull()
    expect(screen.queryByText('3')).toBeNull()
    expect(screen.getByRole('link', { name: 'Perfil' })).toBeInTheDocument()
  })

  it('shows the bell with the real reminder count (no simulated unread) when the flag is on', () => {
    FEATURES.notifications = true
    try {
      renderHeader({ reminderCount: 2 })
      expect(screen.getByRole('link', { name: 'Avisos, 2 sin leer' })).toHaveAttribute(
        'href',
        '/avisos',
      )
    } finally {
      FEATURES.notifications = false
    }
  })

  it('shows the bell with the unread notices of groups even while the old Avisos screen is off', () => {
    renderHeader({ noticeCount: 3 })
    const bell = screen.getByRole('link', { name: 'Avisos, 3 sin leer' })
    expect(bell).toHaveAttribute('href', '/grupos/avisos')
  })

  it('has no bell without notices', () => {
    renderHeader({ noticeCount: 0 })
    expect(screen.queryByRole('link', { name: /Avisos/ })).toBeNull()
  })

  describe('Moni Plus badge on the avatar', () => {
    it('shows "✦ PLUS" over the avatar when Plus is active, and the avatar still opens the profile', () => {
      renderHeader({ isPlus: true })
      const profile = screen.getByRole('link', { name: 'Perfil, Moni Plus activo' })
      expect(profile).toHaveAttribute('href', '/perfil')
      const badge = profile.querySelector('[data-plus-badge]')
      expect(badge).toHaveTextContent('✦ PLUS')
      expect(badge).toHaveClass('bg-gold', 'text-forest', 'pointer-events-none')
      // The photo or initial is still there, not replaced by the badge.
      expect(profile).toHaveTextContent('I')
    })

    it('shows the normal avatar without Plus', () => {
      renderHeader()
      const profile = screen.getByRole('link', { name: 'Perfil' })
      expect(profile).toHaveAttribute('href', '/perfil')
      expect(profile.querySelector('[data-plus-badge]')).toBeNull()
      expect(screen.queryByText(/PLUS/)).toBeNull()
    })
  })
})
