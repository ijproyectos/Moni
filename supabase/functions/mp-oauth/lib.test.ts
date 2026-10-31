import { describe, expect, it, vi } from 'vitest'
import {
  claimManualSync,
  computeImportSince,
  handleStart,
  handleSync,
  handleUnlink,
  MP_CONSENT_VERSION,
  parseRequest,
  sha256Hex,
  type ManualSyncClaim,
  type ManualSyncStore,
  type StartDeps,
  type SyncActionDeps,
  type UnlinkDeps,
} from './lib.ts'

describe('parseRequest', () => {
  it('accepts start with accepted + consent_version and defaults the window to now', () => {
    expect(
      parseRequest({ action: 'start', accepted: true, consent_version: 'x' }),
    ).toEqual({ ok: true, action: 'start', accepted: true, consentVersion: 'x', importWindow: 'now' })
    expect(
      parseRequest({ action: 'start', accepted: true, consent_version: 'x', import_window: '30' }),
    ).toMatchObject({ importWindow: '30' })
  })
  it('rejects unknown actions, bad windows and non-objects', () => {
    expect(parseRequest(null).ok).toBe(false)
    expect(parseRequest({ action: 'nope' }).ok).toBe(false)
    expect(parseRequest({ action: 'start', import_window: '7' }).ok).toBe(false)
    expect(parseRequest({ action: 'unlink' })).toEqual({ ok: true, action: 'unlink' })
  })
})

describe('parseRequest sync', () => {
  it('accepts sync with no other fields', () => {
    expect(parseRequest({ action: 'sync' })).toEqual({ ok: true, action: 'sync' })
  })
})

describe('computeImportSince', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  it('maps the window to a timestamp', () => {
    expect(computeImportSince('now', now).toISOString()).toBe('2026-11-12T12:00:00.000Z')
    expect(computeImportSince('30', now).toISOString()).toBe('2026-10-13T12:00:00.000Z')
    expect(computeImportSince('90', now).toISOString()).toBe('2026-08-14T12:00:00.000Z')
  })
})

describe('handleStart', () => {
  const base = (over: Partial<StartDeps> = {}): StartDeps => ({
    isPlus: vi.fn(async () => true),
    recentStateCount: vi.fn(async () => 0),
    saveState: vi.fn(async () => {}),
    randomState: () => 'STATE-RAW',
    authorizeUrl: (s) => `https://mp.example/authorize?state=${s}`,
    ...over,
  })
  const input = {
    userId: 'u1',
    accepted: true,
    consentVersion: MP_CONSENT_VERSION,
    importWindow: 'now' as const,
  }

  it('refuses a free user with plus_required and creates no state', async () => {
    const deps = base({ isPlus: vi.fn(async () => false) })
    const r = await handleStart(deps, input)
    expect(r).toEqual({ http: 403, body: { error: 'plus_required' } })
    expect(deps.saveState).not.toHaveBeenCalled()
  })

  it('refuses without acceptance or with a stale consent version', async () => {
    const deps = base()
    expect((await handleStart(deps, { ...input, accepted: false })).body).toEqual({
      error: 'consent_required',
    })
    expect((await handleStart(deps, { ...input, consentVersion: 'old' })).body).toEqual({
      error: 'consent_required',
    })
    expect(deps.saveState).not.toHaveBeenCalled()
  })

  it('stores only the state hash and returns the authorize URL', async () => {
    const deps = base()
    const r = await handleStart(deps, { ...input, importWindow: '90' })
    expect(r.http).toBe(200)
    expect(r.body).toEqual({ url: 'https://mp.example/authorize?state=STATE-RAW' })
    const saved = vi.mocked(deps.saveState).mock.calls[0]?.[0]
    expect(saved).toEqual({
      userId: 'u1',
      stateHash: await sha256Hex('STATE-RAW'),
      importWindow: '90',
      consentVersion: MP_CONSENT_VERSION,
    })
    expect(JSON.stringify(saved)).not.toContain('STATE-RAW')
  })

  it('rate-limits repeated starts', async () => {
    const deps = base({ recentStateCount: vi.fn(async () => 10) })
    expect((await handleStart(deps, input)).http).toBe(429)
    expect(deps.saveState).not.toHaveBeenCalled()
  })

  it('maps a persistence failure to server_error', async () => {
    const deps = base({
      saveState: vi.fn(async () => {
        throw new Error('db')
      }),
    })
    expect((await handleStart(deps, input)).http).toBe(500)
  })
})

describe('handleUnlink', () => {
  const conn = { status: 'active' as const }
  const base = (over: Partial<UnlinkDeps> = {}): UnlinkDeps => ({
    loadConnection: vi.fn(async () => conn),
    revoke: vi.fn(async () => {}),
    markUnlinked: vi.fn(async () => {}),
    ...over,
  })

  it('works for any user with a connection: revokes best-effort, then nulls tokens', async () => {
    const deps = base()
    const r = await handleUnlink(deps, { userId: 'u1' })
    expect(r).toEqual({ http: 200, body: { status: 'unlinked' } })
    expect(deps.revoke).toHaveBeenCalledOnce()
    expect(deps.markUnlinked).toHaveBeenCalledWith('u1')
  })

  it('still unlinks when the revoke fails', async () => {
    const deps = base({
      revoke: vi.fn(async () => {
        throw new Error('mp down')
      }),
    })
    expect((await handleUnlink(deps, { userId: 'u1' })).http).toBe(200)
    expect(deps.markUnlinked).toHaveBeenCalled()
  })

  it('works for a lapsed or reconnect-needed connection (no Plus check at all)', async () => {
    const deps = base({ loadConnection: vi.fn(async () => ({ status: 'plus_lapsed' as const })) })
    expect((await handleUnlink(deps, { userId: 'u1' })).http).toBe(200)
  })

  it('is idempotent for an already unlinked connection and 404 for none', async () => {
    const unlinked = base({ loadConnection: vi.fn(async () => ({ status: 'unlinked' as const })) })
    expect((await handleUnlink(unlinked, { userId: 'u1' })).http).toBe(200)
    expect(unlinked.markUnlinked).not.toHaveBeenCalled()
    const none = base({ loadConnection: vi.fn(async () => null) })
    expect(await handleUnlink(none, { userId: 'u1' })).toEqual({
      http: 404,
      body: { error: 'not_connected' },
    })
  })

  it('reports server_error when tokens could not be cleared', async () => {
    const deps = base({
      markUnlinked: vi.fn(async () => {
        throw new Error('db')
      }),
    })
    expect((await handleUnlink(deps, { userId: 'u1' })).http).toBe(500)
  })
})

describe('handleSync (R1.1, R2.1: 5-minute guard, Plus gate)', () => {
  const NOW = new Date('2026-11-12T12:00:00.000Z')
  const release = vi.fn(async () => {})
  const base = (over: Partial<SyncActionDeps> = {}): SyncActionDeps => ({
    loadConnection: vi.fn(async () => ({ status: 'active' as const })),
    isPlus: vi.fn(async () => true),
    claimManualSync: vi.fn(async (): Promise<ManualSyncClaim> => ({ status: 'claimed', release })),
    triggerSync: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  })

  it('triggers the shared sync core for the caller and answers 202', async () => {
    const deps = base()
    expect(await handleSync(deps, { userId: 'u1' })).toEqual({ http: 202, body: { status: 'started' } })
    expect(deps.triggerSync).toHaveBeenCalledWith('u1')
  })
  it('claims with a cutoff of now - 5 minutes', async () => {
    const deps = base()
    await handleSync(deps, { userId: 'u1' })
    expect(deps.claimManualSync).toHaveBeenCalledWith('u1', '2026-11-12T11:55:00.000Z')
  })
  it('a second call inside the window is rate_limited and triggers nothing (no MP call)', async () => {
    const deps = base({ claimManualSync: vi.fn(async (): Promise<ManualSyncClaim> => ({ status: 'guarded' })) })
    expect(await handleSync(deps, { userId: 'u1' })).toEqual({ http: 429, body: { error: 'rate_limited' } })
    expect(deps.triggerSync).not.toHaveBeenCalled()
  })
  it('a connection that is not active anymore is NOT reported as rate_limited', async () => {
    const deps = base({ claimManualSync: vi.fn(async (): Promise<ManualSyncClaim> => ({ status: 'unavailable' })) })
    expect(await handleSync(deps, { userId: 'u1' })).toEqual({ http: 409, body: { error: 'not_active' } })
    expect(deps.triggerSync).not.toHaveBeenCalled()
  })
  it('refuses a free or lapsed user with plus_required before stamping the guard', async () => {
    const deps = base({ isPlus: vi.fn(async () => false) })
    expect(await handleSync(deps, { userId: 'u1' })).toEqual({ http: 403, body: { error: 'plus_required' } })
    expect(deps.claimManualSync).not.toHaveBeenCalled()
    expect(deps.triggerSync).not.toHaveBeenCalled()
  })
  it('404 without a live connection, 409 when the user must reconnect', async () => {
    for (const conn of [null, { status: 'unlinked' as const }]) {
      const deps = base({ loadConnection: vi.fn(async () => conn) })
      expect((await handleSync(deps, { userId: 'u1' })).http).toBe(404)
    }
    const deps = base({ loadConnection: vi.fn(async () => ({ status: 'needs_reconnect' as const })) })
    expect(await handleSync(deps, { userId: 'u1' })).toEqual({ http: 409, body: { error: 'needs_reconnect' } })
    expect(deps.triggerSync).not.toHaveBeenCalled()
  })
  it('maps a trigger failure to server_error', async () => {
    const deps = base({
      triggerSync: vi.fn(async () => {
        throw new Error('down')
      }),
    })
    expect(await handleSync(deps, { userId: 'u1' })).toEqual({ http: 500, body: { error: 'server_error' } })
  })
  it('releases the guard stamp when the trigger fails, so the next try is not blocked for 5 minutes', async () => {
    release.mockClear()
    const deps = base({
      triggerSync: vi.fn(async () => {
        throw new Error('down')
      }),
    })
    await handleSync(deps, { userId: 'u1' })
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('keeps the stamp when the trigger succeeds and still answers 500 if the release itself fails', async () => {
    const ok = base()
    release.mockClear()
    await handleSync(ok, { userId: 'u1' })
    expect(release).not.toHaveBeenCalled()
    const failing = base({
      triggerSync: vi.fn(async () => {
        throw new Error('down')
      }),
      claimManualSync: vi.fn(async (): Promise<ManualSyncClaim> => ({
        status: 'claimed',
        release: async () => {
          throw new Error('db down')
        },
      })),
    })
    expect(await handleSync(failing, { userId: 'u1' })).toEqual({ http: 500, body: { error: 'server_error' } })
  })
})

describe('claimManualSync (guard stamp store)', () => {
  const NOW = new Date('2026-11-12T12:00:00.000Z')
  const CUTOFF = '2026-11-12T11:55:00.000Z'
  const store = (over: Partial<ManualSyncStore> = {}): ManualSyncStore => ({
    read: vi.fn(async () => ({ status: 'active', lastManualSyncAt: null })),
    stampIfDue: vi.fn(async () => true),
    restore: vi.fn(async () => {}),
    ...over,
  })

  it('stamps now and returns a release that restores the previous value', async () => {
    const s = store({ read: vi.fn(async () => ({ status: 'active', lastManualSyncAt: '2026-11-12T10:00:00.000Z' })) })
    const claim = await claimManualSync(s, 'u1', NOW, CUTOFF)
    expect(s.stampIfDue).toHaveBeenCalledWith('u1', NOW.toISOString(), CUTOFF)
    expect(claim.status).toBe('claimed')
    if (claim.status === 'claimed') await claim.release()
    expect(s.restore).toHaveBeenCalledWith('u1', NOW.toISOString(), '2026-11-12T10:00:00.000Z')
  })
  it('zero rows updated while still active inside the window is guarded', async () => {
    const s = store({
      read: vi.fn(async () => ({ status: 'active', lastManualSyncAt: '2026-11-12T11:58:00.000Z' })),
      stampIfDue: vi.fn(async () => false),
    })
    expect(await claimManualSync(s, 'u1', NOW, CUTOFF)).toEqual({ status: 'guarded' })
  })
  it('a connection that is not active is unavailable, not guarded', async () => {
    const s = store({ read: vi.fn(async () => ({ status: 'plus_lapsed', lastManualSyncAt: null })) })
    expect(await claimManualSync(s, 'u1', NOW, CUTOFF)).toEqual({ status: 'unavailable' })
    expect(s.stampIfDue).not.toHaveBeenCalled()
    expect(await claimManualSync(store({ read: vi.fn(async () => null) }), 'u1', NOW, CUTOFF)).toEqual({
      status: 'unavailable',
    })
  })
  it('a connection that stopped being active between the read and the stamp is unavailable', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ status: 'active', lastManualSyncAt: null })
      .mockResolvedValueOnce({ status: 'needs_reconnect', lastManualSyncAt: null })
    const s = store({ read, stampIfDue: vi.fn(async () => false) })
    expect(await claimManualSync(s, 'u1', NOW, CUTOFF)).toEqual({ status: 'unavailable' })
  })
})
