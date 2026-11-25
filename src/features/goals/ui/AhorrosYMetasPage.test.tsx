import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { makeGoal, makeSavings } from '../domain/testing'
import { AhorrosYMetasPage } from './AhorrosYMetasPage'

const ahorrosState = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false }))
vi.mock('@/features/ahorros/api/useAhorros', () => ({
  useAhorros: () => ({ ...ahorrosState, refetch: vi.fn() }),
}))
vi.mock('@/features/settings/api/useSecondaryCurrency', () => ({
  useSecondaryCurrency: () => ({ usesUsd: false }),
}))
const savingsState = vi.hoisted(() => ({ data: null as unknown, isLoading: false, isError: false }))
vi.mock('../api/useSavings', () => ({
  useSavings: () => ({ ...savingsState, refetch: vi.fn() }),
}))

function setup() {
  render(
    <MemoryRouter>
      <AhorrosYMetasPage />
    </MemoryRouter>,
  )
}

describe('AhorrosYMetasPage', () => {
  beforeEach(() => {
    ahorrosState.data = []
    ahorrosState.isLoading = false
    ahorrosState.isError = false
    savingsState.data = makeSavings()
    savingsState.isLoading = false
    savingsState.isError = false
  })

  it('shows one header for both sections, with links to the full screens', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Ahorros y metas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver historial completo' })).toHaveAttribute('href', '/ahorros')
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/metas')
  })

  it('shows the ARS balance from Ahorros', () => {
    ahorrosState.data = [
      { id: '1', currency: 'ARS', kind: 'opening', amountCents: 150_000_00, status: 'posted' },
    ]
    setup()
    expect(screen.getByText('$150.000')).toBeInTheDocument()
  })

  it('shows an empty state when there are no active goals', () => {
    setup()
    expect(screen.getByText('Todavía no tenés metas')).toBeInTheDocument()
  })

  it('lists only the active goals', () => {
    savingsState.data = makeSavings({
      goals: [makeGoal({ id: 'a', name: 'Viaje' }), makeGoal({ id: 'b', name: 'Pausada', status: 'paused' })],
    })
    setup()
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.queryByText('Pausada')).toBeNull()
  })
})
