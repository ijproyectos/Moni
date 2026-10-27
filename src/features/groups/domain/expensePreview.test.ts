import { describe, expect, it } from 'vitest'
import { equalPercentTexts, formatPercentTotal, previewSplit } from './expensePreview'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'

describe('previewSplit', () => {
  it('gives the extra cent to the payer in an equal split of 100 / 3', () => {
    const preview = previewSplit({
      method: 'equal',
      totalCents: 10_000,
      payerId: A,
      participantIds: [A, B, C],
      percentTexts: {},
    })
    expect(preview.shares?.map((s) => s.shareCents)).toEqual([3334, 3333, 3333])
    expect(preview.problem).toBeNull()
  })

  it('requires percentages to add up to 100', () => {
    const base = {
      method: 'percent',
      totalCents: 10_000,
      payerId: A,
      participantIds: [A, B],
    } as const
    const short = previewSplit({ ...base, percentTexts: { [A]: '60', [B]: '30' } })
    expect(short.shares).toBeNull()
    expect(short.percentTotalBp).toBe(9000)
    expect(short.problem).toBe('Los porcentajes tienen que sumar 100.')

    const ok = previewSplit({ ...base, percentTexts: { [A]: '60', [B]: '40' } })
    expect(ok.shares?.map((s) => s.shareCents)).toEqual([6000, 4000])
  })

  it('explains what is missing', () => {
    expect(
      previewSplit({
        method: 'equal',
        totalCents: null,
        payerId: A,
        participantIds: [A],
        percentTexts: {},
      }).problem,
    ).toMatch(/monto/)
    expect(
      previewSplit({
        method: 'equal',
        totalCents: 100,
        payerId: A,
        participantIds: [],
        percentTexts: {},
      }).problem,
    ).toMatch(/al menos una persona/)
  })
})

describe('equalPercentTexts', () => {
  it('adds up to exactly 100', () => {
    expect(equalPercentTexts(3)).toEqual(['33,34', '33,33', '33,33'])
    expect(equalPercentTexts(2)).toEqual(['50', '50'])
    expect(formatPercentTotal(10_000)).toBe('100')
    expect(formatPercentTotal(9_999)).toBe('99,99')
  })
})
