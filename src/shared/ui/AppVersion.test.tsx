import { render, screen } from '@testing-library/react'
import { AppVersion } from './AppVersion'

describe('AppVersion', () => {
  it('renders the injected app version', () => {
    render(<AppVersion />)
    expect(screen.getByText(/^Moni v\d+\.\d+\.\d+/)).toHaveTextContent(`Moni v${__APP_VERSION__}`)
  })
})
