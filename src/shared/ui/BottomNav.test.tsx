import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ShellBottomBar } from '@/app/AppShell'
import { BottomNav } from './BottomNav'

vi.mock('@/features/transactions/ui/QuickAdd', () => ({
  QuickAdd: () => <button type="button">Nuevo movimiento</button>,
}))
vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: null }) }))

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav assistant={<button type="button">Asistente</button>} />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('is a navigation landmark with Hoy, Grupos, Herramientas and the profile avatar', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map((a) => a.textContent)).toEqual(['Hoy', 'Grupos', 'Herramientas', 'V'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/grupos',
      '/mas',
      '/perfil',
    ])
  })

  it('marks only the current tab with aria-current and the dark pill', () => {
    renderNav('/grupos')
    expect(screen.getByRole('link', { name: 'Grupos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Grupos' })).toHaveClass('bg-[#0B3D2E]')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Herramientas' })).not.toHaveClass('bg-[#0B3D2E]')
  })

  it('Hoy is only active on the exact root', () => {
    renderNav('/grupos')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Grupos' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the assistant button apart from the tabs, outside the landmark', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(nav).not.toContainElement(screen.getByRole('button', { name: 'Asistente' }))
  })

  it('keeps the assistant slot clickable: the bar container ignores pointer events', () => {
    renderNav()
    // ShellBottomBar's wrapper is pointer-events-none, so every interactive child must opt back in.
    expect(screen.getByTestId('assistant-slot')).toHaveClass('pointer-events-auto')
  })
})

describe('ShellBottomBar', () => {
  function renderBar(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <input aria-label="Monto" />
        <ShellBottomBar />
      </MemoryRouter>,
    )
  }

  it('lives on the tab routes and declares itself as a bottom action', () => {
    for (const path of ['/', '/actividad', '/grupos', '/mas', '/perfil']) {
      const { container, unmount } = renderBar(path)
      expect(container.querySelector('[data-bottom-action]')).not.toBeNull()
      unmount()
    }
  })

  it('is not shown on inner screens', () => {
    for (const path of ['/metas', '/grupos/nuevo']) {
      const { container, unmount } = renderBar(path)
      expect(container.querySelector('[data-bottom-action]')).toBeNull()
      unmount()
    }
  })

  it('hides while a text field has focus (keyboard open) and returns after', async () => {
    const user = userEvent.setup()
    const { container } = renderBar('/')
    expect(container.querySelector('[data-bottom-action]')).not.toBeNull()
    await user.click(screen.getByLabelText('Monto'))
    expect(container.querySelector('[data-bottom-action]')).toBeNull()
    await user.tab()
    expect(container.querySelector('[data-bottom-action]')).not.toBeNull()
  })
})
