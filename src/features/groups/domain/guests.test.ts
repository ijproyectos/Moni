import { buildPendingDebts } from '@/features/debts/domain/debts'
import { emptyOverlay, type GroupOverlay } from '../mock/overlayStore'
import type { GroupMember, MemberBalance } from './group'
import { balancesWithGuests, buildLedger } from './ledger'

// A group with two people with an account (Ana, Beto) and one without (Fran).
const ANA = '11111111-1111-1111-1111-111111111111'
const BETO = '22222222-2222-2222-2222-222222222222'
const FRAN = 'f0f0f0f0-0000-4000-8000-000000000001'

const member = (userId: string, displayName: string): GroupMember => ({
  userId,
  displayName,
  avatarUrl: null,
  role: 'member',
  joinedAt: '2026-10-01',
  leftAt: null,
})
const balance = (userId: string, displayName: string, netCents: number): MemberBalance => ({
  userId,
  displayName,
  paidCents: 0,
  owedCents: 0,
  settledOutCents: 0,
  settledInCents: 0,
  netCents,
})

// Ana paid 100.000 for a dinner shared by the three (Fran owes 40.000, Beto 30.000, Ana 30.000).
const overlay = (): GroupOverlay => ({
  ...emptyOverlay(),
  guests: [{ id: FRAN, name: 'Fran', alias: 'fran.mp' }],
  expenses: [
    {
      id: 'x1',
      description: 'Cena',
      amountCents: 100_000_00,
      payers: [{ personId: ANA, cents: 100_000_00 }],
      shares: [
        { personId: ANA, cents: 30_000_00 },
        { personId: BETO, cents: 30_000_00 },
        { personId: FRAN, cents: 40_000_00 },
      ],
      occurredOn: '2026-10-20',
      templateSlug: null,
      methodLabel: 'por monto',
      createdAt: '2026-10-20T00:00:00Z',
    },
  ],
})

const serverBalances = [balance(ANA, 'Ana', 0), balance(BETO, 'Beto', 0)]

describe('groups with people with and without an account', () => {
  it('lists the person without an account next to the members, marked as having no Moni', () => {
    const ledger = buildLedger({
      meId: ANA,
      members: [member(ANA, 'Ana'), member(BETO, 'Beto')],
      balances: serverBalances,
      expenses: [],
      overlay: overlay(),
    })
    expect(ledger.people.map((p) => [p.name, p.hasMoni])).toEqual([
      ['Vos', true],
      ['Beto', true],
      ['Fran', false],
    ])
    expect(ledger.paid[ANA]).toBe(100_000_00)
    expect(ledger.owed[FRAN]).toBe(40_000_00)
  })

  it('counts them in who owes whom, and the nets add up to zero', () => {
    const ledger = buildLedger({
      meId: ANA,
      members: [member(ANA, 'Ana'), member(BETO, 'Beto')],
      balances: serverBalances,
      expenses: [],
      overlay: overlay(),
    })
    expect(ledger.nets).toEqual({ [ANA]: 70_000_00, [BETO]: -30_000_00, [FRAN]: -40_000_00 })
    expect(Object.values(ledger.nets).reduce((a, b) => a + b, 0)).toBe(0)
    expect(ledger.transfers.map((t) => [t.fromUserId, t.toUserId, t.amountCents])).toEqual(
      expect.arrayContaining([
        [FRAN, ANA, 40_000_00],
        [BETO, ANA, 30_000_00],
      ]),
    )
  })

  it('a payment recorded for them lowers what they owe, in the ledger', () => {
    const o = overlay()
    o.settlements = [
      {
        id: 's1',
        fromId: FRAN,
        toId: ANA,
        cents: 15_000_00,
        method: 'Efectivo',
        occurredOn: '2026-10-21',
      },
    ]
    const ledger = buildLedger({
      meId: ANA,
      members: [member(ANA, 'Ana'), member(BETO, 'Beto')],
      balances: serverBalances,
      expenses: [],
      overlay: o,
    })
    expect(ledger.nets[FRAN]).toBe(-25_000_00)
    expect(ledger.nets[ANA]).toBe(55_000_00)
  })

  it('does not alter the balances the server already computed', () => {
    const real = [balance(ANA, 'Ana', 10_000_00), balance(BETO, 'Beto', -10_000_00)]
    const merged = balancesWithGuests(real, overlay())
    // The members keep their server net plus what the guest records add; nothing is dropped.
    expect(merged.find((b) => b.userId === ANA)?.netCents).toBe(10_000_00 + 70_000_00)
    expect(merged.find((b) => b.userId === BETO)?.netCents).toBe(-10_000_00 - 30_000_00)
    expect(real.map((b) => b.netCents)).toEqual([10_000_00, -10_000_00])
  })

  it('returns the server balances untouched when there is nothing for people without an account', () => {
    expect(balancesWithGuests(serverBalances, emptyOverlay())).toEqual(serverBalances)
    expect(balancesWithGuests(serverBalances, undefined)).toEqual(serverBalances)
  })

  it('"Deben y te deben": their debts show up, flagged so no reminder is offered', () => {
    const merged = balancesWithGuests(serverBalances, overlay())
    const debts = buildPendingDebts(
      [{ groupId: 'g1', groupName: 'Viaje', balances: merged, guestIds: new Set([FRAN]) }],
      ANA,
      [],
    )
    const fran = debts.find((d) => d.otherUserId === FRAN)
    expect(fran).toMatchObject({
      otherName: 'Fran',
      direction: 'owed',
      amountCents: 40_000_00,
      otherIsGuest: true,
    })
    expect(debts.find((d) => d.otherUserId === BETO)?.otherIsGuest).toBe(false)
  })

  it('a person without an account who paid is owed by the members', () => {
    const o = overlay()
    const [dinner] = o.expenses
    o.expenses = [
      {
        ...(dinner as NonNullable<typeof dinner>),
        id: 'x2',
        payers: [{ personId: FRAN, cents: 60_000_00 }],
        amountCents: 60_000_00,
        shares: [
          { personId: ANA, cents: 30_000_00 },
          { personId: FRAN, cents: 30_000_00 },
        ],
      },
    ]
    const debts = buildPendingDebts(
      [
        {
          groupId: 'g1',
          groupName: 'Viaje',
          balances: balancesWithGuests(serverBalances, o),
          guestIds: new Set([FRAN]),
        },
      ],
      ANA,
      [],
    )
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({
      direction: 'owe',
      otherName: 'Fran',
      amountCents: 30_000_00,
      otherIsGuest: true,
    })
  })
})
