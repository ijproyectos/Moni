import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SharedExpensesCard } from './SharedExpensesCard'

const setup = (owedCents: number, oweCents: number) =>
  render(
    <MemoryRouter>
      <SharedExpensesCard shared={{ owedCents, oweCents }} to="/grupos" />
    </MemoryRouter>,
  )

describe('SharedExpensesCard', () => {
  it('shows what the groups owe the person and leads to split an expense', () => {
    setup(8_450_00, 0)
    const card = screen.getByRole('region', { name: 'Gastos compartidos' })
    expect(card).toHaveTextContent('te deben')
    expect(card).toHaveTextContent('+$8.450')
    expect(screen.getByRole('link', { name: 'Dividir gasto' })).toHaveAttribute('href', '/grupos')
  })

  it('shows what the person owes when nobody owes them', () => {
    setup(0, 12_000_00)
    expect(screen.getByRole('region', { name: 'Gastos compartidos' })).toHaveTextContent('debés')
  })

  it('without balances shows no amount at all', () => {
    setup(0, 0)
    const card = screen.getByRole('region', { name: 'Gastos compartidos' })
    expect(card).toHaveTextContent('Sin saldos pendientes')
    expect(card.textContent).not.toMatch(/\$/)
  })
})
