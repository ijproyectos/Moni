/** Where the jar's coins sit, bottom row first (coordinates of the jar drawing). */
export const COINS: ReadonlyArray<readonly [number, number]> = [
  [143, 396], [178, 396], [213, 396], [248, 396],
  [160, 364], [195, 364], [230, 364],
  [178, 332], [213, 332],
  [196, 300],
]

/** How many of the jar's coins show for a share (0..1): none at 0, at least one as soon as something is saved, all at 100 %. */
export function coinsFor(share: number): number {
  const value = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0))
  if (value <= 0) return 0
  if (value >= 1) return COINS.length
  return Math.max(1, Math.round(value * COINS.length))
}
