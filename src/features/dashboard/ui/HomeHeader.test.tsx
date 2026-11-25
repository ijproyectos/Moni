import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HomeHeader } from './HomeHeader'

vi.mock('@/features/notifications/ui/NotificationCenter', () => ({
  PlusBell: () => <button type="button" aria-label="Notificaciones" />,
}))

function renderHeader(over: Partial<Parameters<typeof HomeHeader>[0]> = {}) {
  render(
    <MemoryRouter>
      <HomeHeader {...over} />
    </MemoryRouter>,
  )
}

describe('HomeHeader: "Hola, nombre"', () => {
  it('says "Hola, [nombre]" on one line, with no time-of-day greeting', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Iara' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('whitespace-nowrap')
    expect(screen.queryByText(/Buen(as|os)? (día|tardes|noches)/)).toBeNull()
    cleanup()
    renderHeader()
    expect(screen.getByRole('heading', { level: 1, name: 'Hola' })).toBeInTheDocument()
  })

  it('has no privacy toggle and no money', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.getByRole('banner')).not.toHaveTextContent(/\$|disponible|Gastos|Ingresos/)
  })

  it('has no avatar and no crown: the profile avatar (with the crown) lives in the bottom bar only', () => {
    renderHeader({ name: 'Iara' })
    expect(screen.queryByRole('button', { name: 'Ver Moni Plus' })).toBeNull()
    expect(screen.queryByAltText('Tu foto de perfil')).toBeNull()
    expect(document.querySelector('[data-plus-crown]')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('HomeHeader: notification bell', () => {
  it('is there for Free and for Moni Plus (the notice center is for everybody)', () => {
    render(<HomeHeader name="Ana" />)
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument()
  })
})
