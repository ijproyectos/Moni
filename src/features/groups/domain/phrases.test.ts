import { debtPhrase, expensePaidPhrase, settlementPhrase, type Segment } from './phrases'

const ME = 'u-me'
const me = { id: ME, name: 'Vos' }
const jonatan = { id: 'u-jon', name: 'Jonatan' }
const ana = { id: 'u-ana', name: 'Ana' }
const plain = (segments: Segment[]) => segments.map((s) => s.text).join('')

describe('settlementPhrase', () => {
  it('speaks in second person when the signed-in person paid', () => {
    expect(plain(settlementPhrase(me, jonatan, ME))).toBe('Le pagaste a Jonatan')
  })
  it('speaks in second person when the signed-in person was paid', () => {
    expect(plain(settlementPhrase(jonatan, me, ME))).toBe('Jonatan te pagó')
  })
  it('keeps the third person between other people', () => {
    expect(plain(settlementPhrase(ana, jonatan, ME))).toBe('Ana le pagó a Jonatan')
  })
  it('never writes "Vos pagó" or "Vos le pagó", whatever name the payer carries', () => {
    for (const text of [
      plain(settlementPhrase(me, jonatan, ME)),
      plain(settlementPhrase(jonatan, me, ME)),
      plain(settlementPhrase(ana, jonatan, ME)),
    ]) {
      expect(text).not.toMatch(/Vos (le )?pagó/)
    }
  })
  it('bolds only the names', () => {
    expect(settlementPhrase(me, jonatan, ME).filter((s) => s.strong)).toEqual([
      { text: 'Jonatan', strong: true },
    ])
    expect(settlementPhrase(ana, jonatan, ME).filter((s) => s.strong)).toHaveLength(2)
  })
  it('tells people apart by id, not by name: a namesake of the user is still someone else', () => {
    const namesake = { id: 'u-other', name: 'Vos' }
    expect(plain(settlementPhrase(namesake, jonatan, ME))).toBe('Vos le pagó a Jonatan')
    const sameNameAsOther = { id: 'u-jon2', name: 'Jonatan' }
    expect(plain(settlementPhrase(sameNameAsOther, jonatan, ME))).toBe('Jonatan le pagó a Jonatan')
  })
})

describe('expensePaidPhrase', () => {
  it('says "Pagaste" for the signed-in person and "<name> pagó" for the rest', () => {
    expect(expensePaidPhrase(me, ME)).toBe('Pagaste')
    expect(expensePaidPhrase(jonatan, ME)).toBe('Jonatan pagó')
  })
  it('adds the amount', () => {
    expect(expensePaidPhrase(me, ME, '$8.000')).toBe('Pagaste $8.000')
    expect(expensePaidPhrase(jonatan, ME, '$8.000')).toBe('Jonatan pagó $8.000')
  })
})

describe('debtPhrase', () => {
  it('"Le debés $X a Jonatan" when the signed-in person owes', () => {
    expect(debtPhrase(me, jonatan, ME, '$5.000')).toBe('Le debés $5.000 a Jonatan')
  })
  it('"Jonatan te debe $X" when someone owes the signed-in person', () => {
    expect(debtPhrase(jonatan, me, ME, '$5.000')).toBe('Jonatan te debe $5.000')
  })
  it('third person between others', () => {
    expect(debtPhrase(ana, jonatan, ME, '$5.000')).toBe('Ana le debe $5.000 a Jonatan')
  })
  it('works without an amount', () => {
    expect(debtPhrase(me, jonatan, ME)).toBe('Le debés a Jonatan')
    expect(debtPhrase(jonatan, me, ME)).toBe('Jonatan te debe')
  })
})
