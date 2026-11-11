import { recentRepeats } from './recentRepeats'
import { makeTransaction } from './testing'

describe('recentRepeats', () => {
  it('groups by note + category, most frequent first, with the latest amount', () => {
    const result = recentRepeats([
      makeTransaction({ id: '1', note: 'Café', amountCents: 450000, occurredOn: '2026-10-01' }),
      makeTransaction({ id: '2', note: 'café', amountCents: 480000, occurredOn: '2026-10-09' }),
      makeTransaction({ id: '3', note: 'SUBE', amountCents: 200000, occurredOn: '2026-10-20' }),
    ])
    expect(result.map((r) => [r.label, r.amountCents])).toEqual([
      ['café', 480000],
      ['SUBE', 200000],
    ])
  })

  it('skips incomes, voided, installments, trips and shared expenses; caps at 4', () => {
    const base = { occurredOn: '2026-10-10' }
    const list = [
      makeTransaction({ id: 'i', kind: 'income', note: 'Sueldo', ...base }),
      makeTransaction({ id: 'v', status: 'voided', note: 'Anulado', ...base }),
      makeTransaction({ id: 'c', installmentPlanId: 'p', note: 'Cuota', ...base }),
      makeTransaction({ id: 't', tripId: 't1', note: 'Viaje', ...base }),
      makeTransaction({ id: 's', sharedExpenseId: 's1', note: 'Grupo', ...base }),
      ...['a', 'b', 'c2', 'd', 'e'].map((n, i) =>
        makeTransaction({ id: n, note: `G${n}`, occurredOn: `2026-10-0${i + 1}` }),
      ),
    ]
    const result = recentRepeats(list)
    expect(result).toHaveLength(4)
    expect(result.map((r) => r.label)).not.toContain('Sueldo')
    expect(result.map((r) => r.label)).not.toContain('Cuota')
  })

  it('uses the category name when there is no note', () => {
    const result = recentRepeats(
      [makeTransaction({ note: null })],
      new Map([['22222222-2222-4222-8222-222222222222', 'Comida']]),
    )
    expect(result[0]).toMatchObject({ label: 'Comida', note: null })
  })
})
