import { render, screen } from '@testing-library/react'
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
          month="2026-10-01"
          latestMonth="2026-10-01"
          onMonthChange={vi.fn()}
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

  it('the green card has very round corners all around, not square ones', () => {
    renderHeader()
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('rounded-[48px]', 'bg-forest')
    expect(header).not.toHaveClass('rounded-b-[40px]')
  })

  it('the available money does not depend on the month: it is what you have now', () => {
    renderHeader({
      month: '2026-08-01',
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
