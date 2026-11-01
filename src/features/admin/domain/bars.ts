import { formatDayLabel } from './format'

export interface BarDatum {
  label: string
  value: number
}

/** Turns [{ day: '2026-11-01', calls: 3 }] style rows into bar data. */
export function toBars<T extends { day: string }>(
  rows: readonly T[],
  pick: (row: T) => number,
): BarDatum[] {
  return rows.map((row) => ({ label: formatDayLabel(row.day), value: pick(row) }))
}
