import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { summarizeTrip } from '../domain/trip'
import { PersonalTripCard } from './TripCards'

const trip = {
  id: 't1',
  name: 'Bariloche',
  startsOn: '2026-11-02',
  endsOn: '2026-11-08',
  budgetCents: 300_000_00,
  archivedAt: null,
}

function renderCard(spentCents: number, today = '2026-11-04') {
  const summary = summarizeTrip(trip, [{ amountCents: spentCents } as never], today)
  render(
    <MemoryRouter>
      <PersonalTripCard trip={trip} summary={summary} today={today} />
    </MemoryRouter>,
  )
}

describe('PersonalTripCard', () => {
  it('links to the trip and shows the real spending against the budget', () => {
    renderCard(185_000_00)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/viajes/t1')
    expect(screen.getByText('Bariloche')).toBeInTheDocument()
    expect(screen.getByText('Gastaste $185.000')).toBeInTheDocument()
    expect(screen.getByText('Presupuesto $300.000')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: 'Gastado del presupuesto de Bariloche' }),
    ).toHaveAttribute('aria-valuenow', '62')
  })

  it('says how much the budget was exceeded, and nothing when it was not', () => {
    renderCard(330_000_00)
    expect(screen.getByText('Te pasaste $30.000 del presupuesto')).toBeInTheDocument()
  })

  it('does not warn while the spending is within the budget', () => {
    renderCard(100_000_00)
    expect(screen.queryByText(/Te pasaste/)).toBeNull()
  })

  it('tells where the trip stands in time', () => {
    renderCard(0, '2026-11-04')
    expect(screen.getByText('Quedan 5 días')).toBeInTheDocument()
  })
})
