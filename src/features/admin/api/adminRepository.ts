import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/shared/lib/supabase'
import type {
  AiOverview,
  AvisosState,
  MpOverview,
  PlusExpiring,
  PlusOverview,
  PushResult,
  Resumen,
  SettingKey,
  SupportFilter,
  SupportInbox,
  SupportReplyResult,
  SupportTicketDetail,
  SystemOverview,
  UserDetail,
  UserFilter,
  UsersPage,
} from '../domain/types'

/** An answer from the admin-panel function that is not a success. `reason` is its short machine code. */
export class AdminApiError extends Error {
  readonly status: number
  readonly reason: string | null
  readonly retryAfterSeconds: number | null

  constructor(status: number, reason: string | null, retryAfterSeconds: number | null = null) {
    super(reason ?? `admin_${status}`)
    this.name = 'AdminApiError'
    this.status = status
    this.reason = reason
    this.retryAfterSeconds = retryAfterSeconds
  }
}

async function invoke(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabase().functions.invoke('admin-panel', { body })
  if (!error) return data
  if (error instanceof FunctionsHttpError) {
    let payload: { error?: unknown; reason?: unknown; retry_after_seconds?: unknown } = {}
    try {
      payload = (await error.context.json()) as typeof payload
    } catch {
      // Not JSON: only the status matters.
    }
    const reason =
      typeof payload.reason === 'string'
        ? payload.reason
        : typeof payload.error === 'string'
          ? payload.error
          : null
    const retry =
      typeof payload.retry_after_seconds === 'number' ? payload.retry_after_seconds : null
    throw new AdminApiError(error.context.status, reason, retry)
  }
  throw new AdminApiError(0, 'network')
}

async function section<T>(body: Record<string, unknown>): Promise<T> {
  const answer = (await invoke(body)) as { data: T }
  return answer.data
}

export const adminApi = {
  resumen: () => section<Resumen>({ section: 'resumen' }),
  usuarios: (args: { search: string; filter: UserFilter; limit: number; offset: number }) =>
    section<UsersPage>({ section: 'usuarios', ...args }),
  usuario: (userId: string) => section<UserDetail>({ section: 'usuario', user_id: userId }),
  plus: () => section<PlusOverview>({ section: 'plus' }),
  ia: () => section<AiOverview>({ section: 'ia' }),
  mp: () => section<MpOverview>({ section: 'mp' }),
  sistema: () => section<SystemOverview>({ section: 'sistema' }),
  plusVencen: (days: number) => section<PlusExpiring>({ section: 'plus_vencen', days }),
  avisos: () => section<AvisosState>({ section: 'avisos' }),
  soporte: (args: { status: SupportFilter; limit: number; offset: number }) =>
    section<SupportInbox>({ section: 'soporte', ...args }),
  soporteTicket: (ticketId: string) =>
    section<SupportTicketDetail>({ section: 'soporte_ticket', ticket_id: ticketId }),
  suspend: async (args: { userId: string; reason: string; confirmEmail: string }) =>
    (await invoke({
      action: 'suspend_user',
      user_id: args.userId,
      reason: args.reason,
      confirm_email: args.confirmEmail,
    })) as { suspended: true },
  unsuspend: async (userId: string) =>
    (await invoke({ action: 'unsuspend_user', user_id: userId })) as { suspended: false },
  notifyPlus: async (userId: string) =>
    (await invoke({ action: 'plus_notify', user_id: userId })) as PushResult,
  replyTicket: async (args: { ticketId: string; reply: string; resolve: boolean }) =>
    (await invoke({
      action: 'support_reply',
      ticket_id: args.ticketId,
      reply: args.reply,
      resolve: args.resolve,
    })) as SupportReplyResult,
  setTicketStatus: async (args: { ticketId: string; status: 'open' | 'resolved' }) =>
    (await invoke({
      action: 'support_status',
      ticket_id: args.ticketId,
      status: args.status,
    })) as { status: 'open' | 'resolved' },
  setSetting: async (args: { key: SettingKey; enabled: boolean }) =>
    (await invoke({ action: 'setting_set', key: args.key, enabled: args.enabled })) as {
      key: SettingKey
      enabled: boolean
    },
  pushToUser: async (args: { userId: string; title: string; body: string }) =>
    (await invoke({
      action: 'push_user',
      user_id: args.userId,
      title: args.title,
      body: args.body,
    })) as PushResult,
}
