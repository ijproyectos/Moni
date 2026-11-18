/**
 * "Hablá con Moni": decides what a free sentence is. A movement ("Gasté $18.000 en el chino", "Cobré 20 mil") goes to
 * the loading flow with its confirmation; anything else is a question for the assistant. It only chooses the path:
 * the AI draft and the person's confirmation are still what decide what gets saved.
 */
// `\b` does not see accented letters as letters, so the edges are checked with Unicode lookarounds.
const MOVEMENT_VERB =
  /(?<![\p{L}])(gast[eéo]|gastamos|pagu[eé]|pag[oó]|pagamos|compr[eéo]|compramos|cobr[eéo]|cobramos|me pagaron|me depositaron|me transfirieron|ingres[oó]|gan[eé]|recib[ií]|puse|sal[ií]o|sali[oó]|invert[ií]|dej[eé])(?![\p{L}])/iu
const HAS_AMOUNT = /\d|(?<![\p{L}])(mil|luca|lucas|palo|palos|pesos)(?![\p{L}])/iu
const QUESTION = /[¿?]|^\s*(cu[aá]nto|cu[aá]ntos|qu[eé]|c[oó]mo|cu[aá]l|cu[aá]ndo|d[oó]nde|por qu[eé])(?![\p{L}])/iu

export function looksLikeMovement(text: string): boolean {
  const t = text.trim()
  if (t === '' || QUESTION.test(t)) return false
  return MOVEMENT_VERB.test(t) && HAS_AMOUNT.test(t)
}
