import { render, screen } from '@testing-library/react'
import { ImportMovementsSheet } from './ImportMovementsSheet'

const plan = vi.hoisted(() => ({ isPlus: false, isFree: true }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => plan }))
vi.mock('@/features/plus/ui/PlusSheet', () => ({ PlusSheet: () => null }))

describe('ImportMovementsSheet (Excel import is Moni Plus)', () => {
  it('a Free person never gets the importer, only the Excel import promo', () => {
    render(<ImportMovementsSheet onClose={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Traé tus movimientos a Moni' })).toBeInTheDocument()
    expect(screen.queryByText(/Elegir archivo|Importar movimientos/)).toBeNull()
  })
})
