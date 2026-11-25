import { describe, expect, it, vi } from 'vitest'
import { type DeleteDeps, parseDeleteRequest, runDeleteAccount } from './lib.ts'

const USER = '11111111-1111-4111-8111-111111111111'

function deps(over: Partial<DeleteDeps> = {}): DeleteDeps {
  return {
    listSubscriptions: vi.fn().mockResolvedValue({ data: [], error: null }),
    storeSubscriptionActive: vi.fn().mockResolvedValue(false),
    cancelMp: vi.fn().mockResolvedValue({ status: 200 }),
    deleteAccount: vi.fn().mockResolvedValue({ data: { status: 'deleted', storage: [] }, error: null }),
    removeStorage: vi.fn().mockResolvedValue(true),
    log: vi.fn(),
    ...over,
  }
}

describe('delete-account orchestration', () => {
  it('needs the confirmation word and touches nothing without it', async () => {
    const d = deps()
    for (const confirmation of [undefined, '', 'eliminar', 'ELIMINAR!', 42]) {
      expect(await runDeleteAccount(d, { userId: USER, confirmation })).toEqual({ http: 400, body: { error: 'invalid_confirmation' } })
    }
    expect(d.deleteAccount).not.toHaveBeenCalled()
    expect(d.cancelMp).not.toHaveBeenCalled()
  })

  it('a Free account is deleted and answers ok', async () => {
    const d = deps()
    expect(await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).toEqual({ http: 200, body: { ok: true } })
    expect(d.deleteAccount).toHaveBeenCalledWith(USER)
    expect(d.cancelMp).not.toHaveBeenCalled()
  })

  it('a Plus account with a Mercado Pago subscription cancels it BEFORE deleting anything', async () => {
    const order: string[] = []
    const d = deps({
      listSubscriptions: vi.fn().mockResolvedValue({
        data: [
          { id: 'a', preapproval_id: 'pre-1', status: 'authorized' },
          { id: 'b', preapproval_id: 'pre-2', status: 'paused' },
          { id: 'c', preapproval_id: 'pre-3', status: 'cancelled' },
          { id: 'd', preapproval_id: null, status: 'pending' },
        ],
        error: null,
      }),
      cancelMp: vi.fn().mockImplementation(async (id: string) => {
        order.push(`cancel:${id}`)
        return { status: 200 }
      }),
      deleteAccount: vi.fn().mockImplementation(async () => {
        order.push('delete')
        return { data: { status: 'deleted', storage: [] }, error: null }
      }),
    })
    expect((await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).http).toBe(200)
    expect(order).toEqual(['cancel:pre-1', 'cancel:pre-2', 'delete'])
  })

  it('if the subscription cannot be cancelled nothing is deleted, so no charge can follow, and it can be retried', async () => {
    const d = deps({
      listSubscriptions: vi.fn().mockResolvedValue({ data: [{ id: 'a', preapproval_id: 'pre-1', status: 'authorized' }], error: null }),
      cancelMp: vi.fn().mockResolvedValue({ status: 503 }),
    })
    expect(await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).toEqual({ http: 502, body: { error: 'subscription_cancel_failed' } })
    expect(d.deleteAccount).not.toHaveBeenCalled()
    const network = deps({
      listSubscriptions: vi.fn().mockResolvedValue({ data: [{ id: 'a', preapproval_id: 'pre-1', status: 'authorized' }], error: null }),
      cancelMp: vi.fn().mockResolvedValue({ status: 0 }),
    })
    expect((await runDeleteAccount(network, { userId: USER, confirmation: 'ELIMINAR' })).http).toBe(502)
  })

  it('a subscription Mercado Pago no longer knows (404) is as good as cancelled', async () => {
    const d = deps({
      listSubscriptions: vi.fn().mockResolvedValue({ data: [{ id: 'a', preapproval_id: 'pre-1', status: 'authorized' }], error: null }),
      cancelMp: vi.fn().mockResolvedValue({ status: 404 }),
    })
    expect((await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).http).toBe(200)
  })

  it('an active App Store / Google Play subscription cannot be cancelled from here: ask to cancel it there, delete nothing', async () => {
    const d = deps({ storeSubscriptionActive: vi.fn().mockResolvedValue(true) })
    expect(await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).toEqual({ http: 409, body: { error: 'store_subscription_active' } })
    expect(d.deleteAccount).not.toHaveBeenCalled()
  })

  it('a database failure is never reported as success', async () => {
    const d = deps({ deleteAccount: vi.fn().mockResolvedValue({ data: null, error: { code: '23503' } }) })
    expect(await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).toEqual({ http: 500, body: { error: 'deletion_failed' } })
  })

  it('retrying after the account was already deleted is fine (idempotent)', async () => {
    const d = deps({ deleteAccount: vi.fn().mockResolvedValue({ data: { status: 'already_deleted', storage: [] }, error: null }) })
    expect((await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).http).toBe(200)
  })

  it('removes the orphan group photos and any personal file; a failure there is logged but the deletion still succeeds', async () => {
    const paths = [{ bucket: 'group-photos', name: 'g1/a.jpg' }, { bucket: 'avatars', name: 'u/me.jpg' }]
    const d = deps({
      deleteAccount: vi.fn().mockResolvedValue({ data: { status: 'deleted', storage: paths }, error: null }),
      removeStorage: vi.fn().mockResolvedValue(false),
    })
    expect((await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })).http).toBe(200)
    expect(d.removeStorage).toHaveBeenCalledWith(paths)
    expect(d.log).toHaveBeenCalled()
  })

  it('never logs ids or names', async () => {
    const d = deps({ deleteAccount: vi.fn().mockResolvedValue({ data: null, error: { code: '23503', message: 'Iara' } }) })
    await runDeleteAccount(d, { userId: USER, confirmation: 'ELIMINAR' })
    expect(JSON.stringify((d.log as ReturnType<typeof vi.fn>).mock.calls)).not.toMatch(/Iara|1111/)
  })
})

describe('parseDeleteRequest (nothing in the request can point at another account)', () => {
  it('reads only the confirmation word and ignores every other field, user ids included', () => {
    expect(parseDeleteRequest(JSON.stringify({ confirmation: 'ELIMINAR', userId: 'someone-else', user_id: 'x', p_user: 'y' }))).toEqual({ ok: true, confirmation: 'ELIMINAR' })
  })
  it('rejects bodies that are not an object', () => {
    for (const raw of ['', 'nope', '[]', 'null', '"x"', '42']) expect(parseDeleteRequest(raw)).toEqual({ ok: false })
  })
})
