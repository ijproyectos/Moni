import type { Cents } from '@/shared/lib/money'
import type { GroupOverlay, SimAmount } from '../mock/overlayStore'
import { memberLabel, type GroupMember, type MemberBalance, type SharedExpense } from './group'
import { simplifyDebts, type Transfer } from './split'

// Combines what Supabase knows about a group with the in-memory overlay (people without Moni,
// simulated expenses and settlements). Real balances stay authoritative; the overlay only adds deltas.

export interface Person {
  id: string
  name: string
  hasMoni: boolean
  isMe: boolean
  alias?: string
}

export interface LedgerExpense {
  id: string
  source: 'real' | 'sim'
  description: string
  amountCents: Cents
  payers: SimAmount[]
  shares: SimAmount[]
  occurredOn: string
  templateSlug: string | null
  methodLabel: string
  createdBy?: string
  real?: SharedExpense
}

export interface Ledger {
  people: Person[]
  expenses: LedgerExpense[]
  nets: Record<string, Cents>
  paid: Record<string, Cents>
  owed: Record<string, Cents>
  transfers: Transfer[]
  totalCents: Cents
  myShareCents: Cents
  myNetCents: Cents
}

export interface LedgerInput {
  meId: string
  members: readonly GroupMember[]
  balances: readonly MemberBalance[]
  expenses: readonly SharedExpense[]
  overlay: GroupOverlay
}

function add(map: Record<string, Cents>, id: string, cents: Cents) {
  map[id] = (map[id] ?? 0) + cents
}

export function buildLedger({ meId, members, balances, expenses, overlay }: LedgerInput): Ledger {
  const people: Person[] = [
    ...members
      .filter((m) => m.leftAt === null)
      .map((m) => ({
        id: m.userId,
        name: m.userId === meId ? 'Vos' : memberLabel(m).split(' ')[0] || memberLabel(m),
        hasMoni: true,
        isMe: m.userId === meId,
      })),
    ...overlay.guests.map((g) => ({
      id: g.id,
      name: g.name,
      hasMoni: false,
      isMe: false,
      alias: g.alias,
    })),
  ].sort((a, b) => Number(b.isMe) - Number(a.isMe))

  const real: LedgerExpense[] = expenses
    .filter((e) => e.status === 'posted')
    .map((e) => ({
      id: e.id,
      source: 'real',
      description: e.description,
      amountCents: e.amountCents,
      payers: [{ personId: e.paidBy, cents: e.amountCents }],
      shares: e.splits.map((s) => ({ personId: s.userId, cents: s.shareCents })),
      occurredOn: e.occurredOn,
      templateSlug: e.templateSlug,
      methodLabel: e.splitMethod === 'percent' ? 'por %' : `entre ${e.splits.length}`,
      createdBy: e.createdBy,
      real: e,
    }))
  const sim: LedgerExpense[] = overlay.expenses.map((e) => ({
    id: e.id,
    source: 'sim',
    description: e.description,
    amountCents: e.amountCents,
    payers: e.payers,
    shares: e.shares,
    occurredOn: e.occurredOn,
    templateSlug: e.templateSlug,
    methodLabel: e.methodLabel,
    createdBy: meId,
  }))
  const all = [...real, ...sim].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))

  const nets: Record<string, Cents> = {}
  const paid: Record<string, Cents> = {}
  const owed: Record<string, Cents> = {}
  for (const b of balances) add(nets, b.userId, b.netCents)
  for (const e of all) {
    for (const p of e.payers) add(paid, p.personId, p.cents)
    for (const s of e.shares) add(owed, s.personId, s.cents)
  }
  for (const e of sim) {
    for (const p of e.payers) add(nets, p.personId, p.cents)
    for (const s of e.shares) add(nets, s.personId, -s.cents)
  }
  for (const s of overlay.settlements) {
    add(nets, s.fromId, s.cents)
    add(nets, s.toId, -s.cents)
  }

  let transfers: Transfer[] = []
  try {
    transfers = simplifyDebts(
      Object.entries(nets)
        .filter(([, cents]) => cents !== 0)
        .map(([userId, netCents]) => ({ userId, netCents })),
    )
  } catch {
    transfers = []
  }

  return {
    people,
    expenses: all,
    nets,
    paid,
    owed,
    transfers,
    totalCents: all.reduce((s, e) => s + e.amountCents, 0),
    myShareCents: owed[meId] ?? 0,
    myNetCents: nets[meId] ?? 0,
  }
}

/** How the overlay changes my balance in a group (used by the groups list). */
export function overlayDeltaFor(overlay: GroupOverlay | undefined, meId: string): Cents {
  if (!overlay) return 0
  let delta = 0
  for (const e of overlay.expenses) {
    for (const p of e.payers) if (p.personId === meId) delta += p.cents
    for (const s of e.shares) if (s.personId === meId) delta -= s.cents
  }
  for (const s of overlay.settlements) {
    if (s.fromId === meId) delta += s.cents
    if (s.toId === meId) delta -= s.cents
  }
  return delta
}

/** Splits `total` across ids proportionally to integer weights; leftovers go to the first ids. */
export function splitByWeights(
  total: Cents,
  ids: readonly string[],
  weights: readonly number[],
): SimAmount[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0 || ids.length === 0) return []
  const bases = weights.map((w) => Math.floor((total * w) / sum))
  let leftover = total - bases.reduce((s, b) => s + b, 0)
  return ids.map((personId, i) => {
    const extra = leftover > 0 ? 1 : 0
    leftover -= extra
    return { personId, cents: (bases[i] ?? 0) + extra }
  })
}

export function personName(people: readonly Person[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? 'Alguien'
}
