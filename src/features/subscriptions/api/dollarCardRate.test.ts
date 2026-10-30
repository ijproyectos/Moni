import { fetchDollarCardRate, parseDollarCardRate } from './dollarCardRate'

const good = {
  moneda: 'USD',
  casa: 'tarjeta',
  compra: 1963,
  venta: 2028,
  fechaActualizacion: '2026-10-29T18:00:00.000Z',
}
const ok = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) })

describe('parseDollarCardRate', () => {
  it('accepts a valid payload and uses venta', () => {
    expect(parseDollarCardRate(good)).toEqual({ sell: 2028, updatedAt: good.fechaActualizacion })
  })
  it.each([
    ['null', null],
    ['wrong house', { ...good, casa: 'oficial' }],
    ['string rate', { ...good, venta: '2028' }],
    ['zero', { ...good, venta: 0 }],
    ['negative', { ...good, venta: -5 }],
    ['absurd', { ...good, venta: 1e9 }],
    ['NaN', { ...good, venta: Number.NaN }],
    ['bad date', { ...good, fechaActualizacion: 'ayer' }],
    ['missing date', { ...good, fechaActualizacion: undefined }],
  ])('rejects %s', (_name, payload) => {
    expect(parseDollarCardRate(payload)).toBeNull()
  })
})

describe('fetchDollarCardRate', () => {
  it('returns the validated rate', async () => {
    await expect(fetchDollarCardRate(ok(good))).resolves.toMatchObject({ sell: 2028 })
  })
  it('throws on a bad status or an invalid body', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => ({}) })
    await expect(fetchDollarCardRate(bad)).rejects.toThrow()
    await expect(fetchDollarCardRate(ok({ ...good, venta: 0 }))).rejects.toThrow()
  })
  it('aborts after the timeout', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    await expect(fetchDollarCardRate(hang as unknown as typeof fetch, 20)).rejects.toThrow(
      'aborted',
    )
  })
})
