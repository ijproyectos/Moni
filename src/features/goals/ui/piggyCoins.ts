/** Where the jar's coins sit: six per row, bottom row first (coordinates of the jar drawing). 24 in all. */
const XS = [135, 162, 189, 216, 243, 270] as const
const YS = [408, 382, 356, 330] as const
export const COINS: ReadonlyArray<readonly [number, number]> = YS.flatMap((y) => XS.map((x) => [x, y] as const))

/**
 * The jar's coins for a share (0..1): whole coins plus ONE growing coin (`partial`, 0..1), so even a small contribution changes
 * what is drawn. Each coin is about 4 % of the goal. Nothing at 0, never a full jar before 100 %.
 */
export function coinLevel(share: number): { full: number; partial: number } {
  const value = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0))
  if (value <= 0) return { full: 0, partial: 0 }
  if (value >= 1) return { full: COINS.length, partial: 0 }
  const total = Math.min(value * COINS.length, COINS.length - 0.01)
  const full = Math.floor(total)
  return { full, partial: total - full }
}

/** How many coins are drawn at all (whole ones plus the growing one). */
export function coinsFor(share: number): number {
  const { full, partial } = coinLevel(share)
  return full + (partial > 0 ? 1 : 0)
}
