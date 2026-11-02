import { monthNameOf } from '@/shared/lib/dates'
import type { IsoDate } from '@/shared/lib/month'

/** Months the chart shows at once. */
export const WINDOW_MONTHS = 6

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
/** "nov". */
export const monthShort = (month: IsoDate) => monthNameOf(month).slice(0, 3)
/** "Noviembre 2026". */
export const monthTitle = (month: IsoDate) =>
  `${capitalize(monthNameOf(month))} ${month.slice(0, 4)}`

/** How a horizontal drag of `dx` pixels moves the window: dragging left shows later months. */
export function swipeShift(dx: number, columnWidth: number): number {
  if (columnWidth <= 0) return 0
  const shift = -Math.round(dx / columnWidth)
  return shift === 0 ? 0 : shift // never -0
}
