import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { PlusRoute } from './PlusRoute'

const plan = vi.hoisted(() => ({ value: { isPlus: false, isFree: true, isLoading: false } }))
vi.mock('@/features/plus/api/usePlus', () => ({ usePlus: () => plan.value }))
vi.mock('@/features/plus/ui/PlusSheet', () => ({ PlusSheet: () => null }))

function setup() {
  render(
    <MemoryRouter initialEntries={['/hormigas']}>
      <Routes>
        <Route path="/mas" element={<p>Explorar</p>} />
        <Route path="/hormigas" element={<PlusRoute feature="ants"><p>Contenido exclusivo</p></PlusRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlusRoute (a screen only for Moni Plus)', () => {
  it('Free, by a direct link: never sees the content, gets the promo, and closing it goes back to Explorar', async () => {
    plan.value = { isPlus: false, isFree: true, isLoading: false }
    setup()
    expect(screen.queryByText('Contenido exclusivo')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Los pequeños gastos también cuentan' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.getByText('Explorar')).toBeInTheDocument()
  })

  it('Plus sees the content', () => {
    plan.value = { isPlus: true, isFree: false, isLoading: false }
    setup()
    expect(screen.getByText('Contenido exclusivo')).toBeInTheDocument()
  })

  it('while the plan is being read nothing of the content shows', () => {
    plan.value = { isPlus: false, isFree: false, isLoading: true }
    setup()
    expect(screen.queryByText('Contenido exclusivo')).toBeNull()
  })

  it('when the plan could not be read (offline) the screen is let through: the server decides what data a Free person gets', () => {
    plan.value = { isPlus: false, isFree: false, isLoading: false }
    setup()
    expect(screen.getByText('Contenido exclusivo')).toBeInTheDocument()
  })
})
