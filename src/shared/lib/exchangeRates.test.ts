import { convertArsCents, fetchExchangeRates, parseExchangeRates } from './exchangeRates'

const good = {
  result: 'success',
  base_code: 'ARS',
  rates: { ARS: 1, USD: 0.000635, EUR: 0.000578 },
  time_last_update_utc: 'Mon, 23 Nov 2026 00:02:32 +0000',
}
const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) })

describe('parseExchangeRates', () => {
  it('accepts a valid payload', () => {
    expect(parseExchangeRates(good)).toEqual({
      rates: good.rates,
      updatedAt: new Date(good.time_last_update_utc).toISOString(),
    })
  })

  it.each([
    ['null', null],
    ['wrong result', { ...good, result: 'error' }],
    ['wrong base', { ...good, base_code: 'USD' }],
    ['missing rates', { ...good, rates: undefined }],
    ['no valid rate entries', { ...good, rates: { USD: -1, EUR: 'nope' } }],
    ['missing date', { ...good, time_last_update_utc: undefined }],
    ['bad date', { ...good, time_last_update_utc: 'no es una fecha' }],
  ])('rejects %s', (_name, payload) => {
    expect(parseExchangeRates(payload)).toBeNull()
  })

  it('drops invalid rate entries but keeps the valid ones', () => {
    const parsed = parseExchangeRates({ ...good, rates: { ...good.rates, BAD: -1, WORSE: 'x' } })
    expect(parsed?.rates).toEqual(good.rates)
  })
})

describe('fetchExchangeRates', () => {
  it('returns the validated rates', async () => {
    await expect(fetchExchangeRates(ok(good))).resolves.toMatchObject({ rates: good.rates })
  })

  it('throws on a bad status or an invalid body', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => ({}) })
    await expect(fetchExchangeRates(bad)).rejects.toThrow()
    await expect(fetchExchangeRates(ok({ ...good, result: 'error' }))).rejects.toThrow()
  })

  it('aborts after the timeout', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    await expect(fetchExchangeRates(hang as unknown as typeof fetch, 20)).rejects.toThrow('aborted')
  })
})

describe('convertArsCents', () => {
  it('converts using the rate (units of target per 1 ARS)', () => {
    expect(convertArsCents(100_000_00, 'USD', good.rates)).toBe(Math.round(100_000_00 * 0.000635))
  })

  it('ARS to ARS is a no-op (rate 1)', () => {
    expect(convertArsCents(123456, 'ARS', good.rates)).toBe(123456)
  })

  it('returns null when there is no rate for that currency', () => {
    expect(convertArsCents(1000, 'ZZZ', good.rates)).toBeNull()
  })

  it('returns null for a zero or negative rate instead of dividing by it', () => {
    expect(convertArsCents(1000, 'BAD', { BAD: 0 })).toBeNull()
    expect(convertArsCents(1000, 'BAD', { BAD: -1 })).toBeNull()
  })
})
