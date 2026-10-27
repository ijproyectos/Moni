import { emptyOverlay } from '../mock/overlayStore'
import type { GroupMember, MemberBalance, SharedExpense } from './group'
import { buildLedger, overlayDeltaFor, splitByWeights } from './ledger'

const ME = '11111111-1111-1111-1111-111111111111'
const MATI = '22222222-2222-2222-2222-222222222222'

const member = (userId: string, displayName: string): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-10-01',
  leftAt: null,
})

const balance = (userId: string, netCents: number): MemberBalance => ({
  userId,
  displayName: null,
  paidCents: 0,
  owedCents: 0,
  settledOutCents: 0,
  settledInCents: 0,
  netCents,
})

const expense: SharedExpense = {
  id: 'e1',
  groupId: 'g1',
  paidBy: ME,
  amountCents: 2_000,
  description: 'Hielo',
  templateSlug: null,
  occurredOn: '2026-10-20',
  splitMethod: 'equal',
  status: 'posted',
  createdBy: ME,
  createdAt: '2026-10-20',
  splits: [
    { userId: ME, shareCents: 1_000, percent: null },
    { userId: MATI, shareCents: 1_000, percent: null },
  ],
}

describe('buildLedger', () => {
  it('keeps real balances when there is no overlay', () => {
    const ledger = buildLedger({
      meId: ME,
      members: [member(ME, 'Juan'), member(MATI, 'Mati Pérez')],
      balances: [balance(ME, 1_000), balance(MATI, -1_000)],
      expenses: [expense],
      overlay: emptyOverlay(),
    })
    expect(ledger.myNetCents).toBe(1_000)
    expect(ledger.totalCents).toBe(2_000)
    expect(ledger.myShareCents).toBe(1_000)
    expect(ledger.people.map((p) => p.name)).toEqual(['Vos', 'Mati'])
    expect(ledger.transfers).toEqual([{ fromUserId: MATI, toUserId: ME, amountCents: 1_000 }])
  })

  it('adds people without Moni and simulated expenses on top of the real balances', () => {
    const overlay = {
      ...emptyOverlay(),
      guests: [{ id: 'guest-fran', name: 'Fran', alias: 'fran.mp' }],
      expenses: [
        {
          id: 'sim-1',
          description: 'Postre',
          amountCents: 3_000,
          payers: [{ personId: ME, cents: 3_000 }],
          shares: [
            { personId: ME, cents: 1_000 },
            { personId: MATI, cents: 1_000 },
            { personId: 'guest-fran', cents: 1_000 },
          ],
          occurredOn: '2026-10-21',
          templateSlug: null,
          methodLabel: 'entre 3',
          createdAt: '2026-10-21',
        },
      ],
    }
    const ledger = buildLedger({
      meId: ME,
      members: [member(ME, 'Juan'), member(MATI, 'Mati')],
      balances: [balance(ME, 1_000), balance(MATI, -1_000)],
      expenses: [expense],
      overlay,
    })
    expect(ledger.myNetCents).toBe(3_000)
    expect(ledger.nets['guest-fran']).toBe(-1_000)
    expect(ledger.expenses[0]?.id).toBe('sim-1')
    expect(overlayDeltaFor(overlay, ME)).toBe(2_000)
    expect(Object.values(ledger.nets).reduce((s, c) => s + c, 0)).toBe(0)
  })
})

describe('splitByWeights', () => {
  it('splits by income share and keeps every cent', () => {
    const shares = splitByWeights(1_001, ['a', 'b'], [60, 40])
    expect(shares).toEqual([
      { personId: 'a', cents: 601 },
      { personId: 'b', cents: 400 },
    ])
  })
})
