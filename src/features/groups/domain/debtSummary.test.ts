import { describe, expect, it } from 'vitest'
import { formatArs } from '@/shared/lib/money'
import {
  reminderMessage,
  summarizeDebts,
  type GroupLedgerEntry,
  type PersonDebt,
} from './debtSummary'

const people = (...names: [string, string][]) =>
  names.map(([id, name]) => ({ id, name, hasMoni: true, isMe: id === 'me' }))

const casa: GroupLedgerEntry = {
  groupId: 'g1',
  groupName: 'Casa',
  meId: 'me',
  ledger: {
    people: people(['me', 'Vos'], ['ana', 'Ana'], ['leo', 'Leo']),
    transfers: [
      { fromUserId: 'ana', toUserId: 'me', amountCents: 10_000 },
      { fromUserId: 'me', toUserId: 'leo', amountCents: 2_500 },
    ],
  },
}
const asado: GroupLedgerEntry = {
  groupId: 'g2',
  groupName: 'Asado',
  meId: 'me',
  ledger: {
    people: people(['me', 'Vos'], ['ana', 'Ana'], ['bea', 'Bea']),
    transfers: [
      { fromUserId: 'ana', toUserId: 'me', amountCents: 5_000 },
      { fromUserId: 'bea', toUserId: 'ana', amountCents: 9_000 },
    ],
  },
}

describe('summarizeDebts', () => {
  it('adds up per person across groups, with a per-group breakdown', () => {
    const s = summarizeDebts([casa, asado])
    expect(s.owed).toHaveLength(1)
    expect(s.owed[0]).toMatchObject({ personId: 'ana', name: 'Ana', totalCents: 15_000 })
    expect(s.owed[0]?.groups.map((g) => g.groupName)).toEqual(['Casa', 'Asado'])
    expect(s.owedTotalCents).toBe(15_000)
    expect(s.owe).toEqual([expect.objectContaining({ name: 'Leo', totalCents: 2_500 })])
    expect(s.oweTotalCents).toBe(2_500)
  })

  it('ignores transfers between other people and is empty without groups', () => {
    expect(summarizeDebts([])).toEqual({ owe: [], owed: [], oweTotalCents: 0, owedTotalCents: 0 })
  })
})

describe('reminderMessage', () => {
  it('names the person, the ARS amount and the group', () => {
    const [ana] = summarizeDebts([casa]).owed
    expect(reminderMessage(ana as PersonDebt)).toBe(
      `Hola Ana, te recuerdo que quedamos en ${formatArs(10_000)} por Casa. ¡Gracias!`,
    )
  })

  it('joins several groups', () => {
    const [ana] = summarizeDebts([casa, asado]).owed
    expect(reminderMessage(ana as PersonDebt)).toContain('por Casa y Asado.')
  })
})
