import type { Cents } from '@/shared/lib/money'
import { formatArs } from '@/shared/lib/money'
import type { Ledger } from './ledger'

/**
 * What the shared summary says, built from the SAME ledger the Resumen screen shows (its expenses, totals, paid / owed
 * / net per person and transfers), formatted with the same `formatArs`: nothing is recalculated here, so the amounts
 * of the text and the image are exactly those of the screen. The person using the app is called by their own name
 * instead of "Vos", because whoever reads the summary is somebody else.
 */
export interface SummaryModel {
  title: string
  dateLabel: string
  peopleCount: number
  expenses: { description: string; amount: string; paidBy: string; manyPayers: boolean }[]
  total: string
  people: { name: string; paid: string; owed: string; net: string; netCents: Cents }[]
  transfers: { from: string; to: string; amount: string; transfer: string }[]
}

export function buildSummaryModel({
  ledger,
  groupName,
  dateLabel,
  meName,
  transferOf,
}: {
  ledger: Ledger
  groupName: string
  dateLabel: string
  /** How the person using the app is named in the summary (their first name). */
  meName: string
  /** The alias / CBU-CVU shown next to who receives a transfer (only what the person chose to share). */
  transferOf: (personId: string) => string
}): SummaryModel {
  const nameOf = (id: string) => {
    const person = ledger.people.find((p) => p.id === id)
    if (!person) return 'Alguien'
    return person.isMe ? meName : person.name
  }
  return {
    title: groupName,
    dateLabel,
    peopleCount: ledger.people.length,
    expenses: ledger.expenses.map((e) => ({
      description: e.description,
      amount: formatArs(e.amountCents),
      manyPayers: e.payers.length > 1,
      paidBy:
        e.payers.length > 1
          ? e.payers.map((p) => `${nameOf(p.personId)} ${formatArs(p.cents)}`).join(' y ')
          : nameOf(e.payers[0]?.personId ?? ''),
    })),
    total: formatArs(ledger.totalCents),
    people: ledger.people.map((p) => {
      const net = ledger.nets[p.id] ?? 0
      return {
        name: nameOf(p.id),
        paid: formatArs(ledger.paid[p.id] ?? 0),
        owed: formatArs(ledger.owed[p.id] ?? 0),
        net: formatArs(net, { signed: true }),
        netCents: net,
      }
    }),
    transfers: ledger.transfers.map((t) => ({
      from: nameOf(t.fromUserId),
      to: nameOf(t.toUserId),
      amount: formatArs(t.amountCents),
      transfer: transferOf(t.toUserId),
    })),
  }
}

/** The summary as plain text for WhatsApp and the like (`*bold*` renders there and is harmless elsewhere). */
export function summaryText(model: SummaryModel): string {
  const lines: string[] = [
    `*Resumen de ${model.title}*`,
    `${model.dateLabel} · ${model.peopleCount} ${model.peopleCount === 1 ? 'persona' : 'personas'}`,
    '',
    '*Gastos*',
  ]
  if (model.expenses.length === 0) lines.push('Todavía no hay gastos.')
  for (const e of model.expenses) {
    const verb = e.manyPayers ? 'pagaron' : 'pagó'
    lines.push(`• ${e.description}: ${e.amount} (${verb} ${e.paidBy})`)
  }
  lines.push(`*Total gastado: ${model.total}*`, '', '*Cuentas*')
  for (const p of model.people)
    lines.push(`• ${p.name}: puso ${p.paid}, le tocaba ${p.owed} → saldo ${p.net}`)
  lines.push('', '*Quién le pasa a quién*')
  if (model.transfers.length === 0) lines.push('¡Están todos a mano!')
  for (const t of model.transfers)
    lines.push(`• ${t.from} → ${t.to}: ${t.amount}${t.transfer ? ` (${t.transfer})` : ''}`)
  lines.push('', '_Hecho con Moni_')
  return lines.join('\n')
}
