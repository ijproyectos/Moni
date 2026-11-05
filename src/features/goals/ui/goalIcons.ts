import { Banknote, Gift, Heart, House, Laptop, Plane, Target, type LucideIcon } from 'lucide-react'
import type { GoalIconName } from '../domain/goals'

export const GOAL_ICONS: Record<GoalIconName, { icon: LucideIcon; bg: string; color: string }> = {
  house: { icon: House, bg: 'var(--color-tint-gold)', color: 'var(--color-ink)' },
  banknote: { icon: Banknote, bg: 'var(--color-tint-teal)', color: 'var(--color-ink)' },
  plane: { icon: Plane, bg: 'var(--color-tint-green)', color: 'var(--color-ink)' },
  heart: { icon: Heart, bg: 'var(--color-tint-red)', color: 'var(--color-expense)' },
  laptop: { icon: Laptop, bg: 'var(--color-tint-green)', color: 'var(--color-ink)' },
  gift: { icon: Gift, bg: 'var(--color-tint-green)', color: 'var(--color-ink)' },
  target: { icon: Target, bg: 'var(--color-tint-gold)', color: 'var(--color-ink)' },
}
