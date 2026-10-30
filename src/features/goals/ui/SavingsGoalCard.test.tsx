import { render, screen } from '@testing-library/react'
import { makeGoal } from '../domain/testing'
import { SavingsGoalCard } from './SavingsGoalCard'

function renderCard(over = {}, today = '2026-11-10') {
  render(<SavingsGoalCard goal={makeGoal(over)} today={today} onOpen={vi.fn()} />)
}

describe('SavingsGoalCard', () => {
  it('shows what is reserved of the target, the percentage, what is missing and the account', () => {
    renderCard({ name: 'Viaje a Brasil', reservedCents: 150_000_00, targetCents: 600_000_00 })
    expect(screen.getByText('Viaje a Brasil')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('Reservado $150.000')).toBeInTheDocument()
    expect(screen.getByText('de $600.000')).toBeInTheDocument()
    expect(screen.getByText('Faltan $450.000')).toBeInTheDocument()
    expect(screen.getByText(/Galicia/)).toBeInTheDocument()
  })

  it('beyond 100 % it says so without breaking: the percentage is real and the bar is full', () => {
    renderCard({ reservedCents: 780_000_00, targetCents: 600_000_00 })
    expect(screen.getByText('130%')).toBeInTheDocument()
    expect(screen.getByText('¡Superaste tu meta por $180.000!')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('shows the target date, the next reminder and the status of a non-active goal', () => {
    renderCard({
      targetDate: '2027-01-15',
      remind: true,
      reminderOn: '2026-11-14',
      frequency: 'weekly',
    })
    expect(screen.getByText(/para el 15 de ene de 2027/)).toBeInTheDocument()
    expect(screen.getByText('Recordatorio: 14/11')).toBeInTheDocument()
  })

  it('a paused goal says so and does not show a reminder', () => {
    renderCard({ status: 'paused', remind: true, reminderOn: '2026-11-14' })
    expect(screen.getByText('Pausada')).toBeInTheDocument()
    expect(screen.queryByText(/Recordatorio/)).toBeNull()
  })

  it('flags an account that is no longer available', () => {
    renderCard({ accountUsable: false })
    expect(screen.getByText('Cuenta no disponible')).toBeInTheDocument()
  })
})
