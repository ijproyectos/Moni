import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AmountDisplay } from './AmountDisplay'
import { HIDDEN_AMOUNTS_STORAGE_KEY, HiddenAmountsProvider } from './HiddenAmountsProvider'
import { useHiddenAmounts } from './hiddenAmountsContext'

function Toggle() {
  const { toggle } = useHiddenAmounts()
  return <button onClick={toggle}>toggle</button>
}

// Node 25+ ships an experimental global localStorage that shadows jsdom's; use a plain in-memory one.
function installMemoryStorage() {
  const data = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
      clear: () => data.clear(),
    },
  })
}

describe('hidden amounts', () => {
  beforeEach(installMemoryStorage)

  it('masks every amount when toggled and persists the choice', async () => {
    const user = userEvent.setup()
    render(
      <HiddenAmountsProvider>
        <Toggle />
        <AmountDisplay cents={1_234_550} />
        <AmountDisplay cents={-5000} />
      </HiddenAmountsProvider>,
    )
    expect(screen.getByText('$12.345,50')).toBeInTheDocument()
    await user.click(screen.getByText('toggle'))
    expect(screen.queryByText('$12.345,50')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Monto oculto')).toHaveLength(2)
    expect(window.localStorage.getItem(HIDDEN_AMOUNTS_STORAGE_KEY)).toBe('1')
  })

  it('starts hidden when the preference was stored', () => {
    window.localStorage.setItem(HIDDEN_AMOUNTS_STORAGE_KEY, '1')
    render(
      <HiddenAmountsProvider>
        <AmountDisplay cents={100} />
      </HiddenAmountsProvider>,
    )
    expect(screen.getByLabelText('Monto oculto')).toBeInTheDocument()
  })
})
