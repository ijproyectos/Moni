import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { HiddenAmountsProvider } from '@/shared/ui/HiddenAmountsProvider'
import { distributionLabel, type HomeBalance } from '../domain/homeBalance'
import { HomeHero } from './HomeHero'

function setup(balance: HomeBalance) {
  render(
    <MemoryRouter>
      <HiddenAmountsProvider>
        <HomeHero balance={balance} />
      </HiddenAmountsProvider>
    </MemoryRouter>,
  )
  return screen.getByRole('region', { name: 'Lo que tenés' })
}

describe('HomeHero', () => {
  it('shows the real total and where the money is', () => {
    setup({ totalCents: 635_000_00, methodCount: 2, top: { name: 'Galicia', percent: 97 } })
    expect(screen.getByTestId('hero-figure')).toHaveTextContent('$635.000')
    expect(screen.getByText('2 medios · el 97% está en Galicia')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '97% del dinero en Galicia' })).toBeInTheDocument()
  })

  it('the total opens Cuentas', () => {
    setup({ totalCents: 635_000_00, methodCount: 2, top: { name: 'Galicia', percent: 97 } })
    expect(screen.getByRole('link', { name: 'Ver mis cuentas y saldos' })).toHaveAttribute('href', '/cuentas')
  })

  it('says only the count when there is no money to split, and "medio" in singular', () => {
    expect(distributionLabel({ totalCents: 0, methodCount: 1, top: null })).toBe('1 medio')
    expect(distributionLabel({ totalCents: 5, methodCount: 3 })).toBe('3 medios')
  })

  it('the total stays on one line and its size follows the width and the length of the amount', () => {
    const { unmount } = render(
      <MemoryRouter>
        <HiddenAmountsProvider>
          <HomeHero balance={{ totalCents: 5_550_553_00, methodCount: 5 }} />
        </HiddenAmountsProvider>
      </MemoryRouter>,
    )
    const long = screen.getByTestId('hero-figure')
    expect(long).toHaveClass('whitespace-nowrap')
    const longWidth = Number(/, ([\d.]+)cqw/.exec(long.style.fontSize)?.[1])
    unmount()
    setup({ totalCents: 550_553_00, methodCount: 5 })
    const shortWidth = Number(/, ([\d.]+)cqw/.exec(screen.getByTestId('hero-figure').style.fontSize)?.[1])
    expect(longWidth).toBeLessThan(shortWidth)
  })

  it('the eye hides the amounts and turns into "Mostrar montos"', async () => {
    const hero = setup({ totalCents: 635_000_00, methodCount: 2 })
    await userEvent.click(within(hero).getByRole('button', { name: 'Ocultar montos' }))
    expect(within(hero).getByRole('button', { name: 'Mostrar montos' })).toBeInTheDocument()
    expect(screen.getByTestId('hero-figure')).not.toHaveTextContent('635')
  })
})
