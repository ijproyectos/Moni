/**
 * How Moni words who paid whom inside a group. People are told apart by their ids (never by comparing names): the signed-in
 * person gets the second person ("Le pagaste a Jonatan", "Jonatan te pagó"), everyone else the third.
 */
export interface Segment {
  text: string
  /** Names are shown in bold. */
  strong?: boolean
}

interface Party {
  id: string
  name: string
}

/** "Le pagaste a Jonatan", "Jonatan te pagó" or "Ana le pagó a Jonatan". */
export function settlementPhrase(from: Party, to: Party, meId: string): Segment[] {
  if (from.id === meId) return [{ text: 'Le pagaste a ' }, { text: to.name, strong: true }]
  if (to.id === meId) return [{ text: from.name, strong: true }, { text: ' te pagó' }]
  return [
    { text: from.name, strong: true },
    { text: ' le pagó a ' },
    { text: to.name, strong: true },
  ]
}

/** Who paid an expense: "Pagaste" or "Jonatan pagó" (with the amount: "Pagaste $8.000", "Jonatan pagó $8.000"). */
export function expensePaidPhrase(payer: Party, meId: string, amount?: string): string {
  const tail = amount ? ` ${amount}` : ''
  return payer.id === meId ? `Pagaste${tail}` : `${payer.name} pagó${tail}`
}

/** "Le debés $X a Jonatan", "Jonatan te debe $X" or "Ana le debe $X a Jonatan"; the amount is optional. */
export function debtPhrase(debtor: Party, creditor: Party, meId: string, amount?: string): string {
  const money = amount ? ` ${amount}` : ''
  if (debtor.id === meId) return `Le debés${money} a ${creditor.name}`
  if (creditor.id === meId) return `${debtor.name} te debe${money}`
  return `${debtor.name} le debe${money} a ${creditor.name}`
}
