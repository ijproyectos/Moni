import { balanceHeadline, balanceTotals, initialsOf, lastExpenseView, mostRecentGroup, reminderMessage, splitShortLabel } from './groupsOverview'
import type { LedgerExpense } from './ledger'

const exp = (over: Partial<LedgerExpense> = {}): LedgerExpense => ({
  id: 'e1',
  source: 'real',
  description: 'Coto',
  amountCents: 10_000,
  payers: [{ personId: 'me', cents: 10_000 }],
  shares: [
    { personId: 'me', cents: 5_000 },
    { personId: 'ana', cents: 5_000 },
  ],
  occurredOn: '2026-11-09',
  templateSlug: null,
  methodLabel: 'entre 2',
  ...over,
})

describe('balanceTotals', () => {
  it('sums what is owed and what is owed by me, with cents', () => {
    expect(balanceTotals([{ myNetCents: 5_765 }, { myNetCents: -1_200 }, { myNetCents: 100 }])).toEqual({
      owedCents: 5_865,
      oweCents: 1_200,
    })
  })
  it('is zero without groups', () => {
    expect(balanceTotals([])).toEqual({ owedCents: 0, oweCents: 0 })
  })
})

describe('mostRecentGroup', () => {
  it('picks the latest activity', () => {
    expect(
      mostRecentGroup([
        { id: 'a', lastActivity: '2026-10-01T00:00:00Z' },
        { id: 'b', lastActivity: '2026-11-01T00:00:00Z' },
      ])?.id,
    ).toBe('b')
    expect(mostRecentGroup([])).toBeUndefined()
  })
})

describe('lastExpenseView', () => {
  it('is null without expenses', () => {
    expect(lastExpenseView([], 'me')).toBeNull()
  })
  it('I paid: the other person owes me their share', () => {
    expect(lastExpenseView([exp()], 'me')).toMatchObject({ paidByMe: true, myDeltaCents: 5_000 })
  })
  it('someone else paid: I owe my share', () => {
    const v = lastExpenseView([exp({ payers: [{ personId: 'ana', cents: 10_000 }] })], 'me')
    expect(v).toMatchObject({ paidByMe: false, payerId: 'ana', myDeltaCents: -5_000 })
  })
})

describe('labels', () => {
  it('50/50 only between two', () => {
    expect(splitShortLabel('entre 2', 2)).toBe('50/50')
    expect(splitShortLabel('entre 3', 3)).toBe('entre 3')
    expect(splitShortLabel('por %', 2)).toBe('por %')
  })
  it('initials', () => {
    expect(initialsOf('Mel Pérez')).toBe('MP')
    expect(initialsOf('ana')).toBe('A')
    expect(initialsOf('  ')).toBe('?')
  })
  it('reminder message names the debtor when there is only one', () => {
    expect(reminderMessage({ debtorNames: ['Ana'], groupName: 'Casa', amountText: '$100' })).toBe(
      'Hola Ana, te recuerdo que quedaron $100 pendientes en el grupo Casa (Moni).',
    )
    expect(reminderMessage({ debtorNames: [], groupName: 'Casa', amountText: '$100' })).toContain('Hola,')
  })
})

describe('balanceHeadline', () => {
  const people = [
    { id: 'me', name: 'Vos' },
    { id: 'ana', name: 'Ana' },
    { id: 'leo', name: 'Leo' },
  ]
  it('names the single debtor', () => {
    expect(
      balanceHeadline({ myNetCents: 500, meId: 'me', people, transfers: [{ fromUserId: 'ana', toUserId: 'me' }] }),
    ).toEqual({ label: 'Ana te debe', otherName: 'Ana', debtorNames: ['Ana'] })
  })
  it('falls back to "Te deben" with several debtors', () => {
    const h = balanceHeadline({
      myNetCents: 500,
      meId: 'me',
      people,
      transfers: [
        { fromUserId: 'ana', toUserId: 'me' },
        { fromUserId: 'leo', toUserId: 'me' },
      ],
    })
    expect(h.label).toBe('Te deben')
    expect(h.debtorNames).toEqual(['Ana', 'Leo'])
  })
  it('names the creditor when I owe', () => {
    expect(
      balanceHeadline({ myNetCents: -500, meId: 'me', people, transfers: [{ fromUserId: 'me', toUserId: 'leo' }] })
        .label,
    ).toBe('Le debés a Leo')
  })
  it('is settled at zero', () => {
    expect(balanceHeadline({ myNetCents: 0, meId: 'me', people, transfers: [] }).label).toBe('Estás al día')
  })
})
