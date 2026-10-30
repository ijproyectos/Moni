import { render, screen } from '@testing-library/react'
import { DebtsSummarySheet } from './DebtsSummarySheet'

const summary = vi.hoisted(() => ({ current: {} as unknown }))
vi.mock('../api/useDebtSummary', () => ({
  useDebtSummary: () => ({ summary: summary.current, isLoading: false, isError: false }),
}))

const debt = (name: string, totalCents: number, groupName: string) => ({
  personId: name,
  name,
  totalCents,
  groups: [{ groupId: 'g', groupName, cents: totalCents }],
})

describe('DebtsSummarySheet', () => {
  beforeEach(() => {
    summary.current = {
      owe: [debt('Leo', 2_500_00, 'Casa')],
      owed: [debt('Ana', 10_000_00, 'Asado')],
      oweTotalCents: 2_500_00,
      owedTotalCents: 10_000_00,
    }
  })

  it('lists who owes me with a total and a WhatsApp reminder', () => {
    render(<DebtsSummarySheet side="owed" groups={[]} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Te deben' })).toBeInTheDocument()
    expect(screen.getByText('Total a cobrar')).toBeInTheDocument()
    expect(screen.getByText('Ana te debe')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Recordar a Ana' })
    const href = link.getAttribute('href') ?? ''
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(decodeURIComponent(href)).toContain('Hola Ana, te recuerdo que quedamos en')
    expect(decodeURIComponent(href)).toContain('por Asado. ¡Gracias!')
  })

  it('lists what I owe without reminders', () => {
    render(<DebtsSummarySheet side="owe" groups={[]} onClose={vi.fn()} />)
    expect(screen.getByText('Le debés a Leo')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Recordar/ })).toBeNull()
  })
})
