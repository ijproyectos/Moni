import { buildSummaryModel, summaryText } from './summaryShare'
import type { Ledger } from './ledger'

const ledger = (over: Partial<Ledger> = {}): Ledger => ({
  people: [
    { id: 'me', name: 'Vos', hasMoni: true, isMe: true },
    { id: 'ana', name: 'Ana', hasMoni: true, isMe: false },
    { id: 'leo', name: 'Leo', hasMoni: false, isMe: false },
  ],
  expenses: [
    {
      id: 'e1',
      source: 'real',
      description: 'Súper',
      amountCents: 123_456_50,
      payers: [{ personId: 'ana', cents: 123_456_50 }],
      shares: [],
      occurredOn: '2026-10-10',
      templateSlug: null,
      methodLabel: '',
    },
  ],
  nets: { me: -41_152_17, ana: 82_304_33, leo: -41_152_16 },
  paid: { ana: 123_456_50 },
  owed: { me: 41_152_17, ana: 41_152_17, leo: 41_152_16 },
  transfers: [
    { fromUserId: 'me', toUserId: 'ana', amountCents: 41_152_17 },
    { fromUserId: 'leo', toUserId: 'ana', amountCents: 41_152_16 },
  ],
  totalCents: 123_456_50,
  myShareCents: 41_152_17,
  myNetCents: -41_152_17,
  ...over,
})

const build = (l: Ledger) =>
  buildSummaryModel({
    ledger: l,
    groupName: 'Finde',
    dateLabel: 'Sábado, 31 de octubre',
    meName: 'Iara',
    transferOf: (id) => (id === 'ana' ? 'Alias: ana.mp' : ''),
  })

describe('summaryShare', () => {
  it('uses the exact amounts of the ledger, with cents when there are some', () => {
    const text = summaryText(build(ledger()))
    expect(text).toContain('• Súper: $123.456,50 (pagó Ana)')
    expect(text).toContain('*Total gastado: $123.456,50*')
    expect(text).toContain('• Iara: puso $0, le tocaba $41.152,17 → saldo -$41.152,17')
    expect(text).toContain('• Ana: puso $123.456,50, le tocaba $41.152,17 → saldo +$82.304,33')
    expect(text).toContain('• Iara → Ana: $41.152,17 (Alias: ana.mp)')
    expect(text).toContain('• Leo → Ana: $41.152,16 (Alias: ana.mp)')
  })

  it('the person using the app is named, never "Vos"', () => {
    expect(summaryText(build(ledger()))).not.toContain('Vos')
  })

  it('says so plainly with no expenses and nobody owing anything', () => {
    const text = summaryText(build(ledger({ expenses: [], transfers: [], totalCents: 0 })))
    expect(text).toContain('Todavía no hay gastos.')
    expect(text).toContain('*Total gastado: $0*')
    expect(text).toContain('¡Están todos a mano!')
  })

  it('a person with the same name as a connector word does not confuse who paid', () => {
    const l = ledger()
    l.people[1] = { id: 'ana', name: 'Ana y Leo', hasMoni: true, isMe: false }
    expect(summaryText(build(l))).toContain('(pagó Ana y Leo)')
  })
})
