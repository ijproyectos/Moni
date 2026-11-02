import { toCents, type Cents } from '@/shared/lib/money'

// The collection of badges. The catalog (names, how to earn them, the picture) lives here; the rules that grant them
// live in the database, so a badge can only exist if it was earned. To add one: a row here, its image in
// src/assets/badges, and its rule in award_goal_progress (a new migration). Nothing else changes.

export interface BadgeDef {
  /** Stable id stored in the database; never derived from anything the person types. */
  key: string
  name: string
  /** How to unlock it (also shown on locked badges). */
  hint: string
  /** A short congratulation for the detail and the celebration. */
  congrats: string
}

export const BADGES: readonly BadgeDef[] = [
  {
    key: 'primera-meta',
    name: 'Primera meta cumplida',
    hint: 'Llegá al 100% de una de tus metas.',
    congrats: '¡Lo lograste! Tu primera meta ya es realidad.',
  },
  {
    key: 'primer-aporte',
    name: 'Primer aporte',
    hint: 'Hacé tu primer aporte a una meta.',
    congrats: '¡Buen comienzo! El primer aporte es el más difícil.',
  },
  {
    key: 'racha-de-ahorro',
    name: 'Racha de ahorro',
    hint: 'Aportá a tus metas tres meses seguidos.',
    congrats: 'Tres meses seguidos ahorrando. ¡Eso es constancia!',
  },
  {
    key: 'mitad-del-camino',
    name: 'Mitad del camino',
    hint: 'Llegá al 50% de una meta.',
    congrats: 'Ya recorriste la mitad del camino. ¡Seguí así!',
  },
  {
    key: 'antes-de-tiempo',
    name: 'Antes de tiempo',
    hint: 'Cumplí una meta antes de su fecha objetivo.',
    congrats: 'Llegaste antes de lo previsto. ¡Qué buen ritmo!',
  },
  {
    key: 'lluvia-de-monedas',
    name: 'Lluvia de monedas',
    hint: 'Cumplí 3 metas.',
    congrats: 'Tres metas cumplidas. ¡Una lluvia de monedas!',
  },
  {
    key: 'lingote-de-oro',
    name: 'Lingote de oro',
    hint: 'Cumplí 5 metas.',
    congrats: 'Cinco metas cumplidas. ¡Vale oro!',
  },
  {
    key: 'fajo-de-billetes',
    name: 'Fajo de billetes',
    hint: 'Cumplí metas por $1.000.000 en total.',
    congrats: 'Ya juntaste un millón en metas cumplidas.',
  },
  {
    key: 'fondo-de-emergencia',
    name: 'Fondo de emergencia',
    hint: 'Completá una meta de tipo Emergencia.',
    congrats: 'Tu fondo de emergencia está listo. Tranquilidad asegurada.',
  },
  {
    key: 'leyenda-del-ahorro',
    name: 'Leyenda del ahorro',
    hint: 'Cumplí 10 metas.',
    congrats: 'Diez metas cumplidas. ¡Sos una leyenda del ahorro!',
  },
]

export function badgeDef(key: string): BadgeDef | undefined {
  return BADGES.find((b) => b.key === key)
}

/** A badge the person earned. The goal is a copy taken when it was earned (it survives a deleted goal). */
export interface EarnedBadge {
  key: string
  goalName: string | null
  targetCents: Cents | null
  earnedAt: string
  seen: boolean
}

export interface GoalAchievement {
  id: string
  goalId: string | null
  goalName: string
  targetCents: Cents
  reachedAt: string
  seen: boolean
}

export function parseBadges(
  rows: readonly {
    badge_key: string
    goal_name: string | null
    target_amount: number | string | null
    earned_at: string
    seen_at: string | null
  }[],
): EarnedBadge[] {
  return rows.map((r) => ({
    key: r.badge_key,
    goalName: r.goal_name,
    targetCents: r.target_amount === null ? null : toCents(r.target_amount),
    earnedAt: r.earned_at,
    seen: r.seen_at !== null,
  }))
}

export function parseAchievements(
  rows: readonly {
    id: string
    goal_id: string | null
    goal_name: string
    target_amount: number | string
    reached_at: string
    seen_at: string | null
  }[],
): GoalAchievement[] {
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goal_id,
    goalName: r.goal_name,
    targetCents: toCents(r.target_amount),
    reachedAt: r.reached_at,
    seen: r.seen_at !== null,
  }))
}

export interface CollectionItem {
  def: BadgeDef
  /** Present only when the badge was really earned. */
  earned: EarnedBadge | null
}

/** Every badge of the catalog, in order, with what the person earned (and nothing invented). */
export function collection(earned: readonly EarnedBadge[]): CollectionItem[] {
  const byKey = new Map(earned.map((b) => [b.key, b]))
  return BADGES.map((def) => ({ def, earned: byKey.get(def.key) ?? null }))
}

export function earnedCount(earned: readonly EarnedBadge[]): number {
  return collection(earned).filter((c) => c.earned).length
}

/** What to celebrate: what is still unseen, goals first, then badges. */
export interface Celebration {
  achievements: GoalAchievement[]
  badges: { def: BadgeDef; earned: EarnedBadge }[]
}

export function pendingCelebration(
  achievements: readonly GoalAchievement[],
  badges: readonly EarnedBadge[],
): Celebration {
  return {
    achievements: achievements.filter((a) => !a.seen),
    badges: badges
      .filter((b) => !b.seen)
      .flatMap((earned) => {
        const def = badgeDef(earned.key)
        return def ? [{ def, earned }] : []
      }),
  }
}

export function hasCelebration(c: Celebration): boolean {
  return c.achievements.length > 0 || c.badges.length > 0
}
