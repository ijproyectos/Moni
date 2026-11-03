import { getSupabase } from '@/shared/lib/supabase'
import type { Ticket, TicketDraft } from '../domain/support'

/** Opens a ticket. Rejects with `too_many_tickets` after 5 in 24 hours (the database enforces it). */
export async function createSupportTicket(draft: TicketDraft): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_support_ticket', {
    p_subject: draft.subject.trim(),
    p_message: draft.message.trim(),
  })
  if (error) throw error
  return data
}

/** The caller's own tickets, newest first (row level security shows nobody else's). */
export async function listMyTickets(): Promise<Ticket[]> {
  const { data, error } = await getSupabase()
    .from('support_tickets')
    .select('id, subject, message, status, reply, replied_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    message: row.message,
    status: row.status,
    reply: row.reply,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
  }))
}
