import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { HomeHeader } from './HomeHeader'

vi.mock('@/features/plus/ui/PlusSheet', () => ({
  PlusSheet: () => <div role="dialog" aria-label="Moni Plus activo" />,
}))

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
    expect(screen.getByRole('heading', { level: 1, name: 'Iara' })).toBeInTheDocument()
    expect(screen.getByText('Buen día')).toBeInTheDocument()
    cleanup()
    renderHeader({ name: 'Iara', now: new Date(2026, 10, 10, 15) })
    expect(screen.getByText('Buenas tardes')).toBeInTheDocument()
    cleanup()
    renderHeader({ now: new Date(2026, 10, 10, 22) })
    expect(screen.getByRole('heading', { level: 1, name: 'Buenas noches' })).toBeInTheDocument()
  })

  it('the privacy toggle lives in the hero (the eye); the header has no bell', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: 'Ocultar montos' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Avisos/ })).toBeNull()
  })

  it('is a plain greeting row: the money moved to the hero and the totals card', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.getByRole('banner')).not.toHaveTextContent(/\$|disponible|Gastos|Ingresos/)
  })

  describe('Moni Plus indicator', () => {
    it('shows "PLUS" over the avatar when Plus is active, and tapping it opens the plans', async () => {
      renderHeader({ isPlus: true })
      const plus = screen.getByRole('button', { name: /Moni Plus activo/ })
      expect(plus.querySelector('[data-plus-badge]')).toHaveTextContent('PLUS')
      expect(plus).toHaveTextContent('I')
      await userEvent.click(plus)
      expect(screen.getByRole('dialog', { name: 'Moni Plus activo' })).toBeInTheDocument()
    })

    it('shows the normal avatar (a link to the profile) without Plus', () => {
      renderHeader()
      expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil')
      expect(screen.queryByText(/PLUS/)).toBeNull()
    })
  })
})
