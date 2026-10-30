import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogSheet } from './CatalogSheet'

function setup() {
  const onPick = vi.fn()
  const onCustom = vi.fn()
  render(<CatalogSheet onPick={onPick} onCustom={onCustom} onClose={vi.fn()} />)
  return { onPick, onCustom, user: userEvent.setup() }
}

describe('CatalogSheet', () => {
  it('shows the services as cards grouped by category, each with its logo and name', () => {
    setup()
    for (const label of [
      'Inteligencia artificial',
      'Streaming',
      'Almacenamiento',
      'Productividad',
      'Gaming',
      'Salud y deporte',
      'Membresías',
    ]) {
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument()
    }
    const ai = screen.getByRole('region', { name: 'Inteligencia artificial' })
    expect(within(ai).getByRole('button', { name: 'ChatGPT' })).toBeInTheDocument()
    expect(within(ai).getAllByRole('button')).toHaveLength(10)
    // Logos only where there is one; the gyms get a generic icon.
    const netflix = screen.getByRole('button', { name: 'Netflix' })
    expect(netflix.querySelector('img')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Smart Fit' }).querySelector('img')).toBeNull()
  })

  it('searches ignoring case and accents and hides empty groups', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('searchbox', { name: 'Buscar servicio' }), 'DISNEY')
    expect(screen.getByRole('button', { name: 'Disney+' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Netflix' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Gaming' })).toBeNull()
  })

  it('offers a custom subscription with the typed name when nothing matches', async () => {
    const { user, onCustom } = setup()
    await user.type(screen.getByRole('searchbox', { name: 'Buscar servicio' }), 'Mi club')
    expect(screen.getByText(/No encontramos «Mi club»/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar «Mi club»' }))
    expect(onCustom).toHaveBeenCalledWith('Mi club')
  })

  it('picking a service returns it', async () => {
    const { user, onPick } = setup()
    await user.click(screen.getByRole('button', { name: 'Canva' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'canva' }))
  })
})
