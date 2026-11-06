import { render, screen } from '@testing-library/react'
import { Utensils } from 'lucide-react'
import type { LedgerExpense, Person } from '../domain/ledger'
import { ExpenseDetailSheet } from './ExpenseDetailSheet'

const people: Person[] = [
  { id: 'u-me', name: 'Vos', hasMoni: true, isMe: true },
  { id: 'u-jon', name: 'Jonatan', hasMoni: true, isMe: false },
]

function sheet(over: Partial<LedgerExpense>) {
  const expense: LedgerExpense = {
    id: 'e1',
    source: 'real',
    description: 'Cena',
    amountCents: 8_000_00,
    payers: [{ personId: 'u-me', cents: 8_000_00 }],
    shares: [
      { personId: 'u-me', cents: 4_000_00 },
      { personId: 'u-jon', cents: 4_000_00 },
    ],
    occurredOn: '2026-11-05',
    templateSlug: null,
    methodLabel: 'entre 2',
    createdBy: 'u-me',
    ...over,
  }
  render(
    <ExpenseDetailSheet
      expense={expense}
      people={people}
      icon={Utensils}
      canEdit={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
    />,
  )
}

describe('ExpenseDetailSheet: who paid, in natural Spanish', () => {
  it('says "Pagaste" when the signed-in person paid, never "Pagó Vos"', () => {
    sheet({})
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Pagaste')
    expect(dialog).not.toHaveTextContent(/Pagó Vos/)
    expect(dialog).toHaveTextContent('Cargado por vos')
  })

  it('says "Pagó Jonatan" when another member paid', () => {
    sheet({ payers: [{ personId: 'u-jon', cents: 8_000_00 }], createdBy: 'u-jon' })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Pagó Jonatan')
    expect(dialog).toHaveTextContent('Cargado por Jonatan')
    expect(dialog).not.toHaveTextContent('Pagaste')
  })

  it('identifies the payer by id: a member whose name is "Vos" is not the signed-in person', () => {
    sheet({ payers: [{ personId: 'u-jon', cents: 8_000_00 }] })
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Pagaste')
  })
})
