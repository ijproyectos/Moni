import { describe, expect, it } from 'vitest'
import { MpApiError, MpServerError } from '../_shared/mpApi.ts'
import {
  buildSearchQuery,
  classifyOperation,
  isSkipRunError,
  isWindowTooLarge,
  normalizePayment,
  parseSearchPage,
  sendsTextToModel,
} from './mpFields.ts'
import { rawPayment } from './fixtures.ts'

describe('normalizePayment', () => {
  it('maps the assumed MP shape and collapses merchant whitespace', () => {
    expect(normalizePayment(rawPayment())).toEqual({
      paymentId: '1001',
      payerId: '111',
      collectorId: '222',
      currency: 'ARS',
      status: 'approved',
      operationType: 'regular_payment',
      poiType: 'PIX',
      amount: 1500.5,
      dateApproved: '2026-11-10T15:00:00.000-03:00',
      dateCreated: '2026-11-10T14:59:00.000-03:00',
      merchant: 'Cafe Martinez',
    })
  })
  // Captured live (task 0.2): when the linked user is the payer, MP sends `payer_id` as a plain field and the
  // other side as a `collector` object; when the user is the collector it sends a `payer` object and `collector_id`.
  it('reads the payer from the flat `payer_id` field when the user is the payer', () => {
    const flat: Record<string, unknown> = { ...rawPayment(), payer_id: 111, collector: { id: 222, first_name: 'X' } }
    delete flat.payer
    delete flat.collector_id
    expect(normalizePayment(flat)).toMatchObject({ payerId: '111', collectorId: '222' })
  })
  it('prefers the payer object when both shapes are present', () => {
    expect(normalizePayment({ ...rawPayment(), payer_id: 999 })).toMatchObject({ payerId: '111' })
  })
  it('never carries payer emails or other payer data', () => {
    expect(JSON.stringify(normalizePayment(rawPayment()))).not.toContain('secret@example.com')
  })
  it('falls back to statement_descriptor and rejects unusable rows', () => {
    expect(normalizePayment(rawPayment({ description: null, statement_descriptor: 'KIOSCO' }))?.merchant).toBe('KIOSCO')
    expect(normalizePayment(rawPayment({ id: undefined }))).toBeNull()
    expect(normalizePayment(rawPayment({ transaction_amount: -1 }))).toBeNull()
    expect(normalizePayment('x')).toBeNull()
  })
  it('cuts the merchant to 200 chars', () => {
    expect(normalizePayment(rawPayment({ description: 'x'.repeat(300) }))?.merchant).toHaveLength(200)
  })
})

describe('classifyOperation', () => {
  it('separates import, recurring and other', () => {
    const c = (op: string, poi = 'PIX') => classifyOperation({ operationType: op, poiType: poi })
    expect(c('regular_payment')).toBe('import')
    expect(c('money_transfer')).toBe('import')
    expect(c('recurring_payment')).toBe('recurring')
    expect(c('account_fund')).toBe('other')
    expect(c('regular_payment', 'SUBSCRIPTIONS')).toBe('recurring')
  })
})

describe('search helpers', () => {
  it('builds the query with the range field, sorting and paging', () => {
    expect(buildSearchQuery('2026-11-01T00:00:00.000Z', '2026-11-12T00:00:00.000Z', 100)).toMatchObject({
      range: 'date_last_updated',
      begin_date: '2026-11-01T00:00:00.000Z',
      end_date: '2026-11-12T00:00:00.000Z',
      limit: '50',
      offset: '100',
    })
  })
  it('parses a page and rejects malformed bodies', () => {
    expect(parseSearchPage({ results: [{}], paging: { total: 7 } })).toEqual({ results: [{}], total: 7 })
    expect(parseSearchPage({ results: [] })).toEqual({ results: [], total: null })
    expect(parseSearchPage({ nope: 1 })).toBeNull()
  })
  it('recognises window-too-large and skip-run errors by code', () => {
    const e = new MpApiError(400)
    e.mpCode = '1000'
    expect(isWindowTooLarge(e)).toBe(true)
    expect(isWindowTooLarge(new MpServerError(500))).toBe(false)
    const s = new MpApiError(400)
    s.mpCode = '2001'
    expect(isSkipRunError(s)).toBe(true)
  })
})

describe('sendsTextToModel (privacy: transfers carry free text)', () => {
  it('allows purchases only', () => {
    expect(sendsTextToModel({ operationType: 'regular_payment' })).toBe(true)
    expect(sendsTextToModel({ operationType: 'money_transfer' })).toBe(false)
    expect(sendsTextToModel({ operationType: 'recurring_payment' })).toBe(false)
    expect(sendsTextToModel({ operationType: '' })).toBe(false)
  })
})
