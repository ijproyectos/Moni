import {
  CONSENT_POINTS,
  DEFAULT_IMPORT_WINDOW,
  IMPORT_WINDOWS,
  MP_CONSENT_VERSION,
  callbackFeedback,
  connectionNotice,
  formatLastSync,
  isMpAuthorizeUrl,
  parseConnection,
  parseDuplicates,
  parsePendingLink,
  safeApiBase,
  unimportedNotice,
} from './mpImport'

describe('mpImport domain', () => {
  it('uses the consent version the server expects and defaults to "from now"', () => {
    expect(MP_CONSENT_VERSION).toBe('mp-import-v1')
    expect(DEFAULT_IMPORT_WINDOW).toBe('now')
    expect(IMPORT_WINDOWS.map((w) => w.value)).toEqual(['now', '30', '90'])
  })

  it('consent text names the Claude API and says only the merchant text of purchases is sent', () => {
    const text = CONSENT_POINTS.join(' ')
    expect(text).toMatch(/Claude API/)
    expect(text).toMatch(/solo el texto del comercio de cada compra/i)
  })

  it('consent text is honest about transfers: never sent, and it does not promise what it cannot guarantee', () => {
    const text = CONSENT_POINTS.join(' ')
    expect(text).toMatch(/transferencias[^.]*no se envía/i)
    expect(text).not.toMatch(/no se envían[^.]*nombres de personas/i)
  })

  it('parses the connection row and rejects unknown statuses', () => {
    const row = {
      status: 'active',
      mp_user_id: '123',
      import_since: '2026-11-01T00:00:00Z',
      last_sync_at: '2026-11-02T10:00:00Z',
      last_error_class: null,
    }
    expect(parseConnection([row])).toEqual({
      status: 'active',
      lastSyncAt: '2026-11-02T10:00:00Z',
      lastErrorClass: null,
      importSince: '2026-11-01T00:00:00Z',
    })
    expect(parseConnection([])).toBeNull()
    expect(parseConnection([{ ...row, status: 'weird' }])).toBeNull()
    expect(parseConnection(null)).toBeNull()
  })

  it('maps callback params to feedback and ignores unrelated ones', () => {
    expect(callbackFeedback(new URLSearchParams('mp=ok'))).toEqual({
      tone: 'success',
      message: expect.stringMatching(/Mercado Pago/),
    })
    expect(callbackFeedback(new URLSearchParams('mp=error&reason=denied'))?.message).toMatch(
      /no diste permiso/i,
    )
    expect(
      callbackFeedback(new URLSearchParams('mp=error&reason=mp_account_in_use'))?.message,
    ).toMatch(/otra cuenta de Moni/)
    expect(callbackFeedback(new URLSearchParams('mp=error&reason=zzz'))?.tone).toBe('error')
    expect(callbackFeedback(new URLSearchParams('tab=cuotas'))).toBeNull()
  })

  it('only trusts Mercado Pago https authorize URLs', () => {
    expect(isMpAuthorizeUrl('https://auth.mercadopago.com.ar/authorization?client_id=1')).toBe(true)
    expect(isMpAuthorizeUrl('https://evil.example/authorization')).toBe(false)
    expect(isMpAuthorizeUrl('http://auth.mercadopago.com.ar/authorization')).toBe(false)
    expect(isMpAuthorizeUrl(undefined)).toBe(false)
  })

  it('explains the last sync error only for classes worth showing', () => {
    expect(connectionNotice('rate_limited')).toMatch(/próxima/i)
    expect(connectionNotice('mp_unavailable')).toMatch(/Mercado Pago/)
    expect(connectionNotice(null)).toBeNull()
    expect(connectionNotice('unexpected')).not.toBeNull()
  })

  it('parses duplicate rows into cents and drops malformed ones', () => {
    const rows = [
      {
        payment_id: 'p1',
        transaction_id: 't1',
        duplicate_transaction_id: 't2',
        occurred_on: '2026-05-10',
        duplicate_occurred_on: '2026-05-11',
        amount: 800.5,
      },
      { payment_id: 'p2' },
    ]
    expect(parseDuplicates(rows)).toEqual([
      {
        paymentId: 'p1',
        occurredOn: '2026-05-10',
        duplicateOccurredOn: '2026-05-11',
        cents: 80050,
      },
    ])
    expect(parseDuplicates(null)).toEqual([])
  })

  it('prints the last sync in Argentina time and handles "never"', () => {
    expect(formatLastSync('2026-11-02T13:00:00Z')).toBe('02/11 10:00')
    expect(formatLastSync(null)).toBeNull()
    expect(formatLastSync('garbage')).toBeNull()
  })

  it('unimportedNotice: nothing for zero or junk, singular and plural otherwise', () => {
    expect(unimportedNotice(0)).toBeNull()
    expect(unimportedNotice(-1)).toBeNull()
    expect(unimportedNotice(Number.NaN)).toBeNull()
    expect(unimportedNotice(1)).toMatch(/1 pago de Mercado Pago/)
    expect(unimportedNotice(3)).toMatch(/3 pagos de Mercado Pago/)
  })

  it('safeApiBase keeps only the origin of an https URL (http only for localhost)', () => {
    expect(safeApiBase('https://abc.supabase.co/rest/v1?x=1')).toBe('https://abc.supabase.co')
    expect(safeApiBase('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321')
    expect(safeApiBase('http://localhost:54321/')).toBe('http://localhost:54321')
    for (const bad of ['http://evil.example', 'https://u:p@evil.example', 'javascript:alert(1)', 'nope', '', undefined, 3]) {
      expect(safeApiBase(bad)).toBeNull()
    }
  })

  it('parsePendingLink accepts a fresh code/state pair and rejects stale or malformed ones', () => {
    const now = 1_000_000_000
    const raw = (over: Record<string, unknown> = {}) => JSON.stringify({ code: 'c', state: 's', at: now - 1000, ...over })
    expect(parsePendingLink(raw(), now)).toEqual({ code: 'c', state: 's' })
    expect(parsePendingLink(raw({ at: now - 11 * 60 * 1000 }), now)).toBeNull()
    expect(parsePendingLink(raw({ at: now + 60_000 }), now)).toBeNull()
    expect(parsePendingLink(raw({ code: '' }), now)).toBeNull()
    expect(parsePendingLink(raw({ state: 5 }), now)).toBeNull()
    expect(parsePendingLink(raw({ code: 'x'.repeat(501) }), now)).toBeNull()
    expect(parsePendingLink('{nope', now)).toBeNull()
    expect(parsePendingLink(null, now)).toBeNull()
  })
})
