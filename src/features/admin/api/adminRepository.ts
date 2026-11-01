import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/shared/lib/supabase'
import type {
  AiOverview,
  MpOverview,
  PlusOverview,
  PushResult,
  Resumen,
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
  pushToUser: async (args: { userId: string; title: string; body: string }) =>
    (await invoke({
      action: 'push_user',
      user_id: args.userId,
      title: args.title,
      body: args.body,
    })) as PushResult,
}
