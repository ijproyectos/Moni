import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { toUserMessage } from '@/shared/lib/errors'
import { deleteAccount, DeleteAccountError, isDeleteConfirmed } from './deleteAccount'

const invoke = vi.hoisted(() => vi.fn())
const getUser = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase', () => ({ supabase: null, getSupabase: () => ({ functions: { invoke }, auth: { getUser } }) }))

const httpError = (code: string, status = 400) => new FunctionsHttpError(new Response(JSON.stringify({ error: code }), { status }))

describe('deleteAccount', () => {
  beforeEach(() => {
    invoke.mockReset()
    getUser.mockReset()
  })

  it('calls the delete-account function with the confirmation word and resolves only on ok', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await expect(deleteAccount('ELIMINAR')).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('delete-account', { body: { confirmation: 'ELIMINAR' } })
  })

  it('without an ok from the server it never reports success on its own: it checks whether the account still exists', async () => {
    invoke.mockResolvedValue({ data: {}, error: null })
    getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(deleteAccount('ELIMINAR')).rejects.toMatchObject({ code: 'deletion_failed' })
  })

  it('carries the server code and each one has a readable message', async () => {
    for (const [code, text] of [
      ['store_subscription_active', /App Store o de Google Play/],
      ['subscription_cancel_failed', /no eliminamos nada/],
      ['deletion_failed', /No pudimos eliminar tu cuenta/],
    ] as const) {
      invoke.mockResolvedValue({ data: null, error: httpError(code) })
      getUser.mockClear()
      const error = await deleteAccount('ELIMINAR').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(DeleteAccountError)
      expect((error as DeleteAccountError).code).toBe(code)
      expect(toUserMessage(error)).toMatch(text)
      // The server said nothing was deleted: it is believed, no verification needed.
      expect(getUser).not.toHaveBeenCalled()
    }
  })

  describe('the answer did not arrive (the account may have been deleted anyway)', () => {
    const lost = () => new FunctionsFetchError(new TypeError('Failed to fetch'))
    const userGone = { data: { user: null }, error: Object.assign(new Error('User from sub claim in JWT does not exist'), { code: 'user_not_found', status: 403 }) }

    it('network cut after the deletion: Auth says the account is gone, so it is a success (nobody is left stuck in the dialog)', async () => {
      invoke.mockResolvedValue({ data: null, error: lost() })
      getUser.mockResolvedValue(userGone)
      await expect(deleteAccount('ELIMINAR')).resolves.toBeUndefined()
    })

    it('a retry of a deletion that already happened gets a 401 from the function and is still verified as a success', async () => {
      invoke.mockResolvedValue({ data: null, error: httpError('not_authenticated', 401) })
      getUser.mockResolvedValue(userGone)
      await expect(deleteAccount('ELIMINAR')).resolves.toBeUndefined()
    })

    it('an unexpected server error is verified too', async () => {
      invoke.mockResolvedValue({ data: null, error: httpError('server_error', 500) })
      getUser.mockResolvedValue(userGone)
      await expect(deleteAccount('ELIMINAR')).resolves.toBeUndefined()
    })

    it('the account is still there: it is a real failure, never a success', async () => {
      invoke.mockResolvedValue({ data: null, error: lost() })
      getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
      await expect(deleteAccount('ELIMINAR')).rejects.toMatchObject({ code: 'deletion_failed' })
    })

    it('it cannot be told (offline): neither success nor failure, an honest message and a safe retry', async () => {
      invoke.mockResolvedValue({ data: null, error: lost() })
      getUser.mockRejectedValue(new TypeError('Failed to fetch'))
      const error = await deleteAccount('ELIMINAR').catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'result_unknown' })
      expect(toUserMessage(error)).toMatch(/No pudimos confirmar si tu cuenta se eliminó/)
    })

    it('a session that is simply missing is not taken for a deleted account', async () => {
      invoke.mockResolvedValue({ data: null, error: lost() })
      getUser.mockResolvedValue({ data: { user: null }, error: Object.assign(new Error('Auth session missing!'), { code: undefined }) })
      await expect(deleteAccount('ELIMINAR')).rejects.toMatchObject({ code: 'result_unknown' })
    })
  })

  it('the typed word must match exactly', () => {
    expect(isDeleteConfirmed('ELIMINAR')).toBe(true)
    expect(isDeleteConfirmed(' ELIMINAR ')).toBe(true)
    for (const bad of ['', 'eliminar', 'ELIMINAR!', 'ELIMINA']) expect(isDeleteConfirmed(bad)).toBe(false)
  })
})
