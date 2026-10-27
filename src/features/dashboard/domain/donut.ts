export interface DonutArc {
  /** Stroke length of the arc, in the same units as `circumference`. */
  length: number
  /** Distance from the start of the circle (12 o'clock) to the arc start. */
  offset: number
}

/** Arcs for a donut built from circle strokes; amounts <= 0 are skipped. A tiny gap separates arcs. */
export function donutArcs(amounts: readonly number[], circumference: number, gap = 2): DonutArc[] {
  const total = amounts.reduce((sum, a) => sum + Math.max(a, 0), 0)
  if (total <= 0) return []
  let cursor = 0
  return amounts.map((amount) => {
    const share = (Math.max(amount, 0) / total) * circumference
    const arc = { length: Math.max(share - gap, 0), offset: cursor }
    cursor += share
    return arc
  })
}
