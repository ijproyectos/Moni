import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { InsightsView } from '../api/useInsights'
import { InsightsPage } from './InsightsPage'

const state = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('../api/useInsights', () => ({ useInsights: () => state.view }))

function setup(view: Partial<InsightsView>) {
  state.view = { isLoading: false, isError: false, insights: [], dismiss: vi.fn(), ...view }
  render(
    <MemoryRouter>
      <InsightsPage />
    </MemoryRouter>,
  )
  return state.view as InsightsView
}

describe('InsightsPage', () => {
  it('shows an honest empty state', () => {
    setup({})
    expect(screen.getByText('Todo tranquilo por ahora')).toBeInTheDocument()
    expect(screen.queryByText(/nuevo/)).toBeNull()
  })

  it('renders one card per real insight, with detail and dismiss but no alert action', async () => {
    const view = setup({
      insights: [
        { kind: 'ant', key: 'ant:2026-11', labels: ['Café', 'Kiosco'], yearlyCents: 480_000_00, weeklyCents: 9_200_00, count: 14 },
        { kind: 'subscription', key: 'sub:1:x', name: 'Netflix', percent: 18, fromCents: 11_999_00, toCents: 14_159_00, period: 'monthly' },
      ],
    })
    expect(screen.getByText('2 nuevos')).toBeInTheDocument()
    expect(screen.getByText(/Café \+ Kiosco =/).closest('p')).toBeInTheDocument()
    expect(screen.getByText('Netflix subió 18%')).toBeInTheDocument()
    expect(screen.queryByText('Crear alerta')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Ver detalle' })[0]).toHaveAttribute('href', '/hormigas')
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Descartar' }).at(1) as HTMLElement)
    expect(view.dismiss).toHaveBeenCalledWith('sub:1:x')
  })
})
