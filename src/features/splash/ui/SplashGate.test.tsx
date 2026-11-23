import { render, screen } from '@testing-library/react'
import { resetSplashDecision, SPLASH_SESSION_KEY } from '../domain/coldStart'
import { SplashGate } from './SplashGate'

describe('SplashGate', () => {
  beforeEach(() => {
    resetSplashDecision()
    window.sessionStorage.clear()
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('renders the app and no splash when this session already started', () => {
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    render(<SplashGate><p>App real</p></SplashGate>)
    expect(screen.getByText('App real')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Moni' })).toBeNull()
  })

  it('on a cold start renders the app underneath (it loads in the background) with the splash on top, and hides the app from assistive tech', () => {
    const { unmount } = render(<SplashGate><p>App real</p></SplashGate>, { container: document.getElementById('root') as HTMLElement })
    expect(screen.getByText('App real')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Moni' })).toBeInTheDocument()
    expect(document.getElementById('root')).toHaveAttribute('inert')
    unmount()
    expect(document.getElementById('root')).not.toHaveAttribute('inert')
  })
})
