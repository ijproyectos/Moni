import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

  it('the privacy toggle moved to the hero ("Ocultar"); the header has no bell', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Ocultar montos' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Avisos/ })).toBeNull()
  })

  it('is a plain greeting row: the money moved to the hero and the totals card', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.getByRole('banner')).not.toHaveTextContent(/\$|disponible|Gastos|Ingresos/)
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
