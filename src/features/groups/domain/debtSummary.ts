import { formatArs, type Cents } from '@/shared/lib/money'
import type { Ledger } from './ledger'

/** One group's ledger, as needed to know who owes me / whom I owe there. */
export interface GroupLedgerEntry {
  groupId: string
  groupName: string
  meId: string
  ledger: Pick<Ledger, 'people' | 'transfers'>
}

export interface PersonDebt {
  personId: string
  name: string
  totalCents: Cents
  /** Per-group breakdown (largest first). */
  groups: { groupId: string; groupName: string; cents: Cents }[]
}

export interface DebtSummary {
  /** People I owe money to. */
  owe: PersonDebt[]
  /** People who owe me money. */
  owed: PersonDebt[]
  oweTotalCents: Cents
  owedTotalCents: Cents
}

function addDebt(
  map: Map<string, PersonDebt>,
  personId: string,
  name: string,
  group: { groupId: string; groupName: string },
  cents: Cents,
) {
  const current = map.get(personId) ?? { personId, name, totalCents: 0, groups: [] }
  current.totalCents += cents
  current.groups.push({ ...group, cents })
  map.set(personId, current)
}

function sorted(map: Map<string, PersonDebt>): PersonDebt[] {
  return [...map.values()]
    .map((d) => ({ ...d, groups: [...d.groups].sort((a, b) => b.cents - a.cents) }))
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name))
}

/**
 * Who owes me and whom I owe, per person, from each group's simplified transfers (the same ones the group
 * detail shows). Money is not netted across groups: each side's total equals the sum of my per-group nets, so
 * it matches the "Debés" / "Te deben" figures of the list.
 */
export function summarizeDebts(entries: readonly GroupLedgerEntry[]): DebtSummary {
  const owe = new Map<string, PersonDebt>()
  const owed = new Map<string, PersonDebt>()
  for (const { groupId, groupName, meId, ledger } of entries) {
    const nameOf = (id: string) => ledger.people.find((p) => p.id === id)?.name ?? 'Sin nombre'
    for (const t of ledger.transfers) {
      if (t.amountCents <= 0) continue
      const group = { groupId, groupName }
      if (t.fromUserId === meId) addDebt(owe, t.toUserId, nameOf(t.toUserId), group, t.amountCents)
      else if (t.toUserId === meId)
        addDebt(owed, t.fromUserId, nameOf(t.fromUserId), group, t.amountCents)
    }
  }
  const sum = (m: Map<string, PersonDebt>) => [...m.values()].reduce((s, d) => s + d.totalCents, 0)
  return {
    owe: sorted(owe),
    owed: sorted(owed),
    oweTotalCents: sum(owe),
    owedTotalCents: sum(owed),
  }
}

/** "A", "A y B", "A, B y C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** WhatsApp reminder for someone who owes the person money. Only uses the name and group names we have. */
export function reminderMessage(debt: Pick<PersonDebt, 'name' | 'totalCents' | 'groups'>): string {
  const groups = joinNames(debt.groups.map((g) => g.groupName))
  return `Hola ${debt.name}, te recuerdo que quedamos en ${formatArs(debt.totalCents)} por ${groups}. ¡Gracias!`
}
