import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelWithFallback,
  currentCancelSpelling,
  MP_CANCEL_STATUS,
  resetCancelSpelling,
} from './mpCancel.ts'

const ok = { status: 200, json: { id: 'p', status: 'cancelled' } }
const bad = { status: 400, json: null }

describe('cancelWithFallback', () => {
  beforeEach(() => resetCancelSpelling())

  it('starts with the documented-by-plugin spelling and stops on success', async () => {
    const send = vi.fn().mockResolvedValue(ok)
    expect(await cancelWithFallback(send)).toBe(ok)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(MP_CANCEL_STATUS)
    expect(currentCancelSpelling()).toBe('canceled')
  })

  it('retries exactly once with the other spelling on 400 and remembers it', async () => {
    const send = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(ok)
    expect((await cancelWithFallback(send)).status).toBe(200)
    expect(send.mock.calls.map((c) => c[0])).toEqual(['canceled', 'cancelled'])
    expect(currentCancelSpelling()).toBe('cancelled')

    const next = vi.fn().mockResolvedValue(ok)
    await cancelWithFallback(next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith('cancelled')
  })

  it('never loops: two 400s end the attempt and keep the preferred spelling', async () => {
    const send = vi.fn().mockResolvedValue(bad)
    expect((await cancelWithFallback(send)).status).toBe(400)
    expect(send).toHaveBeenCalledTimes(2)
    expect(currentCancelSpelling()).toBe('canceled')
  })

  it.each([0, 401, 404, 429, 500])('does not retry on %i', async (status) => {
    const send = vi.fn().mockResolvedValue({ status, json: null })
    await cancelWithFallback(send)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
