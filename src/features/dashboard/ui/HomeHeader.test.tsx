import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { HomeHeader } from './HomeHeader'

vi.mock('@/features/notifications/ui/NotificationCenter', () => ({
  PlusBell: () => <button type="button" aria-label="Notificaciones" />,
}))


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

describe('HomeHeader: "Hola, nombre", crown and avatar', () => {
  it('says "Hola, [nombre]" on one line, with no time-of-day greeting', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Iara' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('whitespace-nowrap')
    expect(screen.queryByText(/Buen(as|os)? (día|tardes|noches)/)).toBeNull()
    cleanup()
    renderHeader()
    expect(screen.getByRole('heading', { level: 1, name: 'Hola' })).toBeInTheDocument()
  })

  it('has no bell, no privacy toggle and no money', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.queryByRole('link', { name: /Avisos/ })).toBeNull()
    expect(screen.getByRole('banner')).not.toHaveTextContent(/\$|disponible|Gastos|Ingresos/)
  })

  it('the avatar opens Moni Plus (plans and benefits), never the profile, with or without Plus', async () => {
    renderHeader()
    expect(screen.queryByRole('link', { name: 'Perfil' })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ver Moni Plus' }))
    expect(screen.getByRole('dialog', { name: 'Moni Plus activo' })).toBeInTheDocument()
  })

  describe('Moni Plus crown', () => {
    it('shows a small gold crown only with Plus, and tapping it opens the benefits', async () => {
      renderHeader({ isPlus: true })
      const crown = screen.getByRole('button', { name: /Moni Plus activo/ })
      expect(crown.querySelector('img')?.getAttribute('src')).toMatch(/F3DC96|corona_moni/)
      // Worn on top of the avatar: centered, with no circle or border around it.
      expect(crown).toHaveClass('left-1/2', '-translate-x-1/2')
      expect(crown.className).not.toMatch(/rounded-full|ring-|border|bg-/)
      expect(screen.queryByText('PLUS')).toBeNull()
      // The avatar opens Moni Plus too, and nothing in the header goes to the profile.
      expect(screen.getByRole('button', { name: 'Ver Moni Plus' })).toBeInTheDocument()
      expect(screen.queryByRole('link')).toBeNull()
      await userEvent.click(crown)
      expect(screen.getByRole('dialog', { name: 'Moni Plus activo' })).toBeInTheDocument()
    })

    it('has no crown without Plus', () => {
      renderHeader()
      expect(document.querySelector('[data-plus-crown]')).toBeNull()
    })
  })
})

describe('HomeHeader: notification bell', () => {
  it('is only for Moni Plus', () => {
    const { rerender } = render(<HomeHeader initial="A" name="Ana" isPlus />)
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument()
    rerender(<HomeHeader initial="A" name="Ana" isPlus={false} />)
    expect(screen.queryByRole('button', { name: 'Notificaciones' })).toBeNull()
  })
})
