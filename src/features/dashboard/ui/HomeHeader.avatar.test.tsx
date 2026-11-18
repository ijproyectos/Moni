import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { HomeHeader } from './HomeHeader'

function setup(over: Partial<Parameters<typeof HomeHeader>[0]> = {}) {
  render(
    <MemoryRouter>
      <HiddenAmountsProvider>
        <HomeHeader initial="I" name="Iara" {...over} />
      </HiddenAmountsProvider>
    </MemoryRouter>,
  )
}

describe('HomeHeader: the avatar of the signed-in account is the only picture', () => {
  it('has no Moni icon next to the avatar', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Preguntale a Moni' })).toBeNull()
    expect(screen.getByRole('banner').querySelector('img[src*="mascot"]')).toBeNull()
  })

  it('with Plus the avatar carries the PLUS indicator', () => {
    setup({ isPlus: true })
    const plus = screen.getByRole('button', { name: /Moni Plus activo/ })
    expect(plus).toHaveTextContent('I')
    expect(plus.querySelector('[data-plus-badge]')).toHaveTextContent('PLUS')
  })

  it('shows the account photo when there is one', () => {
    setup({ photoUrl: 'https://example.test/avatar.png' })
    expect(screen.getByAltText('Tu foto de perfil')).toHaveAttribute(
      'src',
      'https://example.test/avatar.png',
    )
  })
})
