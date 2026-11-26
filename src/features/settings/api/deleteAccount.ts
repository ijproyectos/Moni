import { FunctionsHttpError } from '@supabase/supabase-js'
import { assertOnline } from '@/shared/lib/offline'
import { getSupabase } from '@/shared/lib/supabase'

export const DELETE_CONFIRMATION_WORD = 'ELIMINAR'

/** Carries the `delete-account` error code so `toUserMessage` can map it. */
export class DeleteAccountError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DeleteAccountError'
  }
}

/** The server's own answer for a request it understood (null for a network failure or anything that did not come from the function). */
async function codeOf(error: unknown): Promise<string | null> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await (error.context as Response).json()
      const code = (body as { error?: unknown } | null)?.error
      if (typeof code === 'string' && code !== '') return code
    } catch {
      // Not JSON: it did not come from the function.
    }
  }
  return null
}

/** Answers the function gives AFTER checking things and that always mean "nothing was deleted". Everything else is ambiguous. */
const DEFINITIVE = new Set([
  'invalid_confirmation',
  'invalid_request',
  'store_subscription_active',
  'subscription_cancel_failed',
  'deletion_failed',
  'server_misconfigured',
])

/**
 * Asks Auth whether the account is still there. A deleted account's session answers `user_not_found` ("the user of this JWT does not
 * exist"). Anything we cannot tell (offline, timeout, no session) is `unknown`: never taken for success and never for failure.
 */
export async function accountStatus(): Promise<'gone' | 'exists' | 'unknown'> {
  try {
    const { data, error } = await getSupabase().auth.getUser()
    if (data?.user) return 'exists'
    const code = (error as { code?: string } | null)?.code
    const message = (error as { message?: string } | null)?.message ?? ''
    if (code === 'user_not_found' || /user_not_found|does not exist/i.test(message)) return 'gone'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Deletes the signed-in account for real, through the `delete-account` Edge Function (the service-role key never reaches the app). It
 * resolves ONLY when the account is really gone, and never leaves the person guessing:
 *   - the server said ok: done;
 *   - the server said it did not delete anything (confirmation, store subscription, cancel failed…): that error;
 *   - the answer did not arrive or is ambiguous (network cut after the deletion, timeout, the session of an account that no longer
 *     exists answering 401): ask Auth. Gone = success (the response was only lost); still there = the real error; cannot tell =
 *     `result_unknown`, and tapping again is safe (the deletion is repeatable and a gone account is verified, not deleted twice).
 * Needs a connection.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  assertOnline()
  const { data, error } = await getSupabase().functions.invoke('delete-account', { body: { confirmation } })
  if (!error && (data as { ok?: unknown } | null)?.ok === true) return
  const code = error ? await codeOf(error) : null
  if (code !== null && DEFINITIVE.has(code)) throw new DeleteAccountError(code)
  const state = await accountStatus()
  if (state === 'gone') return
  if (state === 'exists') throw new DeleteAccountError(code && code !== 'not_authenticated' ? code : 'deletion_failed')
  throw new DeleteAccountError('result_unknown')
}

/** True when what was typed is exactly the confirmation word (the server checks it again). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRMATION_WORD
}
