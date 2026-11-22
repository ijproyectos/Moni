import { debtSentence, type Person } from './ledger'

const people: Person[] = [
  { id: 'me', name: 'Vos', hasMoni: true, isMe: true },
  { id: 'jo', name: 'Jonatan', hasMoni: true, isMe: false },
  { id: 'an', name: 'Ana', hasMoni: true, isMe: false },
]
const t = (fromUserId: string, toUserId: string) => ({ fromUserId, toUserId, amountCents: 15_000_00 })

describe('debtSentence', () => {
  it('uses real names: "Jonatan le debe $15.000 a Iara" and the other way round', () => {
    expect(debtSentence(people, t('jo', 'me'), 'Iara')).toBe('Jonatan le debe $15.000 a Iara')
    expect(debtSentence(people, t('me', 'jo'), 'Iara')).toBe('Iara le debe $15.000 a Jonatan')
  })

  it('without a profile name it stays understandable', () => {
    expect(debtSentence(people, t('jo', 'me'), null)).toBe('Jonatan te debe $15.000')
    expect(debtSentence(people, t('me', 'jo'), null)).toBe('Le debés $15.000 a Jonatan')
  })

  it('between two other people it names both', () => {
    expect(debtSentence(people, t('jo', 'an'), 'Iara')).toBe('Jonatan le debe $15.000 a Ana')
  })
})
