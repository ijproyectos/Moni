import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FEATURES } from '@/shared/config/features'
import { HomeHeader } from './HomeHeader'

function renderHeader(over: Partial<Parameters<typeof HomeHeader>[0]> = {}) {
  render(
    <MemoryRouter>
      <HomeHeader initial="I" {...over} />
    </MemoryRouter>,
  )
}

describe('HomeHeader: greeting, bell and avatar', () => {
  it('greets by time of day with the name, and the date below', () => {
    renderHeader({ name: 'Iara', now: new Date(2026, 10, 10, 9, 41) })
    expect(screen.getByRole('heading', { level: 1, name: 'Buen día, Iara' })).toBeInTheDocument()
    expect(screen.getByText(/^\S+ \d{1,2} de \S+$/)).toBeInTheDocument()
    cleanup()
    renderHeader({ name: 'Iara', now: new Date(2026, 10, 10, 15) })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Buenas tardes, Iara')
    cleanup()
    renderHeader({ now: new Date(2026, 10, 10, 22) })
    expect(screen.getByRole('heading', { level: 1, name: 'Buenas noches' })).toBeInTheDocument()
  })

  it('has the privacy eye next to the bell', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Ocultar montos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('is a plain greeting row: the money moved to the hero and the totals card', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.getByRole('banner')).not.toHaveTextContent(/\$|disponible|Gastos|Ingresos/)
  })

  it('always has the bell, without a badge while notifications have no backend, even with reminders', () => {
    renderHeader({ reminderCount: 4 })
    expect(screen.getByRole('link', { name: 'Avisos' })).toHaveAttribute('href', '/grupos/avisos')
    expect(screen.queryByText('4')).toBeNull()
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

  describe('Moni Plus badge on the avatar', () => {
    it('shows "✦ PLUS" over the avatar when Plus is active, and the avatar still opens the profile', () => {
      renderHeader({ isPlus: true })
      const profile = screen.getByRole('link', { name: 'Perfil, Moni Plus activo' })
      expect(profile).toHaveAttribute('href', '/perfil')
      const badge = profile.querySelector('[data-plus-badge]')
      expect(badge).toHaveTextContent('✦ PLUS')
      expect(badge).toHaveClass('bg-gold', 'text-on-bright', 'pointer-events-none')
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
