import type { IsoDate } from '@/shared/lib/month'

export const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
}

/** "12 al 19 de dic" / "28 de feb al 3 de mar". */
export function rangeLabel(from: IsoDate, to: IsoDate): string {
  const [, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [, tm, td] = to.split('-').map(Number) as [number, number, number]
  return fm === tm
    ? `${fd} al ${td} de ${MONTHS[fm - 1]}`
    : `${fd} de ${MONTHS[fm - 1]} al ${td} de ${MONTHS[tm - 1]}`
}
