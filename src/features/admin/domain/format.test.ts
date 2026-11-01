import { describe, expect, it } from 'vitest'
import {
  daysInactiveChip,
  formatArDate,
  formatArDateTime,
  formatBytes,
  formatDayLabel,
  formatPesos,
  formatUsd,
} from './format'

describe('daysInactiveChip', () => {
  it.each([
    [0, 'active'],
    [1, 'active'],
    [2, 'recent'],
    [7, 'recent'],
    [8, 'idle'],
    [30, 'idle'],
    [31, 'inactive'],
    [400, 'inactive'],
  ])('%i days -> %s', (days, tone) => {
    expect(daysInactiveChip(days).tone).toBe(tone)
  })
})

describe('money', () => {
  it('formats ARS in whole pesos with dot grouping', () => {
    expect(formatPesos(0)).toBe('$0')
    expect(formatPesos(999)).toBe('$999')
    expect(formatPesos(1234)).toBe('$1.234')
    expect(formatPesos(1234.5)).toBe('$1.235')
    expect(formatPesos(1234567.4)).toBe('$1.234.567')
    expect(formatPesos(-2500)).toBe('-$2.500')
  })
  it('formats USD with 2 decimals', () => {
    expect(formatUsd(0)).toBe('US$ 0,00')
    expect(formatUsd(3.5)).toBe('US$ 3,50')
    expect(formatUsd(1234.567)).toBe('US$ 1.234,57')
  })
  it('does not print NaN', () => {
    expect(formatPesos(Number.NaN)).toBe('—')
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('dates', () => {
  it('uses Argentina time (UTC-3)', () => {
    expect(formatArDateTime('2026-11-01T02:30:00Z')).toBe('31/10/2026 23:30')
    expect(formatArDate('2026-11-01T02:30:00Z')).toBe('31/10/2026')
  })
  it('handles null and garbage', () => {
    expect(formatArDateTime(null)).toBe('—')
    expect(formatArDateTime('nope')).toBe('—')
  })
  it('labels a calendar day without shifting it', () => {
    expect(formatDayLabel('2026-11-01')).toBe('01/11')
  })
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
  })
})
