import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { MonthSummary } from '../domain/monthSummary'
import { HomeScreen } from './HomeScreen'

const summary: MonthSummary = {
  incomeCents: 100_000_00,
  expenseCents: 20_000_00,
  balanceCents: 0,
  availableBalanceCents: 568_000_00,
  byCategory: [
    {
      categoryId: 'c1',
      name: 'Comida',
      color: '#E5533D',
      icon: 'Utensils',
      amountCents: 20_000_00,
      percent: 100,
    },
  ],
  daily: [],
  recent: [],
}

describe('HomeScreen: no Metas card', () => {
  it('does not show the Metas summary nor its link to the goals', () => {
    render(
      <MemoryRouter>
        <HomeScreen summary={summary} initial="J" onAddMovement={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('heading', { name: 'En qué se fue' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Hormigas/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Metas' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Ver la meta|Ver las \d+/ })).toBeNull()
    expect(screen.queryByRole('progressbar', { name: 'Avance de tus metas' })).toBeNull()
  })
})
