import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ShellBottomBar } from '@/app/AppShell'
import { BottomNav } from './BottomNav'

vi.mock('@/features/auth/api/authContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => ({ isPlus: false }) }))

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('has Inicio, Grupos, Tarjetas, Explorar and the profile avatar', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Inicio', 'Grupos', 'Tarjetas', 'Explorar', 'Perfil'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/grupos', '/cuentas', '/mas', '/perfil'])
  })

  it('only the current tab is marked and shows its name; the others are icons', () => {
    renderNav('/grupos')
    expect(screen.getByRole('link', { name: 'Grupos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Grupos' })).toHaveTextContent('Grupos')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveTextContent('')
  })

  it('Inicio is only active on the exact root', () => {
    renderNav('/grupos')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('Tarjetas is active anywhere in Medios de pago', () => {
    renderNav('/cuentas')
    expect(screen.getByRole('link', { name: 'Tarjetas' })).toHaveAttribute('aria-current', 'page')
  })

  it('has no add button: adding lives in Inicio', () => {
    renderNav()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('BottomNav: Moni Plus crown', () => {
  function renderPlus(isPlus: boolean, onCrownClick = vi.fn()) {
    render(
      <MemoryRouter>
        <BottomNav isPlus={isPlus} onCrownClick={onCrownClick} />
      </MemoryRouter>,
    )
    return onCrownClick
  }

  it('with Plus the crown sits centered on the profile avatar, outside the link, and opens the benefits', async () => {
    const onClick = renderPlus(true)
    const crown = screen.getByRole('button', { name: /Moni Plus activo/ })
    expect(crown).toHaveAttribute('data-plus-crown')
    expect(crown).toHaveClass('left-1/2', '-translate-x-1/2')
    expect(crown.closest('a')).toBeNull()
    expect(crown.parentElement).toContainElement(screen.getByRole('link', { name: 'Perfil' }))
    await userEvent.click(crown)
    expect(onClick).toHaveBeenCalled()
  })

  it('on the free plan the avatar has no crown', () => {
    renderPlus(false)
    expect(document.querySelector('[data-plus-crown]')).toBeNull()
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
    for (const path of ['/', '/actividad', '/grupos', '/cuentas', '/mas', '/perfil']) {
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
