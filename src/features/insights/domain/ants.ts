import { z } from 'zod'
import { formatArs, toCents, type Cents } from '@/shared/lib/money'
import { changePercent } from './weekly'

// Shape returned by public.get_ant_expenses (see docs/SPRINT_5.md).
const cents = z.number().transform((value) => toCents(value))

const rawAntsSchema = z.object({
  month: z.string(),
  threshold: cents,
  month_total: cents,
  share_of_expenses: z.number().nullable(),
  groups: z.array(
    z.object({
      category_id: z.string(),
      category_name: z.string(),
      color: z.string(),
      icon: z.string(),
      label: z.string(),
      count: z.number().int(),
      total: cents,
      average: cents,
      yearly_projection: cents,
    }),
  ),
})

export interface AntGroup {
  categoryId: string
  categoryName: string
  color: string
  icon: string
  label: string
  count: number
  totalCents: Cents
  averageCents: Cents
  yearlyProjectionCents: Cents
}

export interface AntExpenses {
  month: string
  /** Largest amount counted as an "ant". */
  thresholdCents: Cents
  /** Sum of all qualifying groups. */
  monthTotalCents: Cents
  /** Percent of the month's expenses (null when there were no expenses). */
  shareOfExpenses: number | null
  groups: AntGroup[]
}

export function parseAntExpenses(payload: unknown): AntExpenses {
  const raw = rawAntsSchema.parse(payload)
  return {
    month: raw.month,
    thresholdCents: raw.threshold,
    monthTotalCents: raw.month_total,
    shareOfExpenses: raw.share_of_expenses,
    groups: raw.groups.map((g) => ({
      categoryId: g.category_id,
      categoryName: g.category_name,
      color: g.color,
      icon: g.icon,
      label: g.label,
      count: g.count,
      totalCents: g.total,
      averageCents: g.average,
      yearlyProjectionCents: g.yearly_projection,
    })),
  }
}

export function antKey(group: Pick<AntGroup, 'categoryId' | 'label'>): string {
  return `${group.categoryId}|${group.label.toLowerCase()}`
}

/** Change of each group's total against the same group in the previous month (null: it was not an ant then). */
export function groupDeltas(
  current: readonly AntGroup[],
  previous: readonly AntGroup[],
): Map<string, Cents | null> {
  const before = new Map(previous.map((g) => [antKey(g), g.totalCents]))
  return new Map(
    current.map((g) => {
      const old = before.get(antKey(g))
      return [antKey(g), old === undefined ? null : g.totalCents - old]
    }),
  )
}

export function monthChangePercent(current: AntExpenses, previous: AntExpenses | undefined) {
  return previous ? changePercent(current.monthTotalCents, previous.monthTotalCents) : null
}

/** One friendly, deterministic suggestion based on the biggest ant. Never judgmental. */
export function buildAntsTip(groups: readonly AntGroup[]): string {
  const top = groups[0]
  if (!top)
    return 'no veo gastos chicos que se repitan. Seguí así, o ajustá el tope para mirar más de cerca.'
  const half = Math.round(top.totalCents / 2)
  return `${top.label.toLowerCase()} es tu hormiga más grande: ${top.count} veces este mes, ${formatArs(top.totalCents)} en total. Si la mitad las hacés de otra forma, ahorrás unos ${formatArs(half)} al mes (${formatArs(half * 12)} al año). Solo si te cuadra.`
}
