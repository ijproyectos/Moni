export const SUBJECT_MIN = 3
export const SUBJECT_MAX = 120
export const MESSAGE_MAX = 2000
/** Tickets a person can open in a rolling 24 hours (enforced by create_support_ticket). */
export const TICKETS_PER_DAY = 5

/** The text shown to a person whose account is suspended. */
export const SUSPENDED_MESSAGE = 'Tu cuenta está suspendida. Escribinos a soporte.'

/** Where a suspended person (who cannot use the in-app form) can write; empty when this build sets none. */
export function getSupportEmail(): string {
  const value = import.meta.env.VITE_SUPPORT_EMAIL
  return typeof value === 'string' ? value.trim() : ''
}

export interface TicketDraft {
  subject: string
  message: string
}

export type TicketProblem = 'subject_short' | 'subject_long' | 'message_empty' | 'message_long'

/** What is wrong with a draft, or null when it can be sent. Mirrors the database checks. */
export function validateTicket(draft: TicketDraft): TicketProblem | null {
  const subject = draft.subject.trim()
  const message = draft.message.trim()
  if (subject.length < SUBJECT_MIN) return 'subject_short'
  if (subject.length > SUBJECT_MAX) return 'subject_long'
  if (message.length === 0) return 'message_empty'
  if (message.length > MESSAGE_MAX) return 'message_long'
  return null
}

export const TICKET_PROBLEM_TEXT: Record<TicketProblem, string> = {
  subject_short: `El asunto necesita al menos ${SUBJECT_MIN} letras.`,
  subject_long: `El asunto puede tener hasta ${SUBJECT_MAX} caracteres.`,
  message_empty: 'Contanos qué pasó.',
  message_long: `El mensaje puede tener hasta ${MESSAGE_MAX} caracteres.`,
}

export interface Ticket {
  id: string
  subject: string
  message: string
  status: 'open' | 'resolved'
  reply: string | null
  repliedAt: string | null
  createdAt: string
}

/** Short status for the list: an answered ticket reads "Respondida" even while it stays open. */
export function ticketStatusLabel(ticket: Pick<Ticket, 'status' | 'reply'>): string {
  if (ticket.status === 'resolved') return 'Resuelta'
  return ticket.reply ? 'Respondida' : 'Abierta'
}

/** The user-facing reason for a failed `create_support_ticket` call. */
export function describeTicketError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : ''
  if (message.includes('too_many_tickets'))
    return `Ya enviaste ${TICKETS_PER_DAY} consultas en las últimas 24 horas. Esperá a que te respondamos o probá mañana.`
  return 'No pudimos enviar tu consulta. Probá de nuevo.'
}
