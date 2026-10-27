import { Banknote, Gift, Heart, House, Laptop, Plane, Target, type LucideIcon } from 'lucide-react'
import type { GoalIconName } from '../domain/goals'

export const GOAL_ICONS: Record<GoalIconName, { icon: LucideIcon; bg: string; color: string }> = {
  house: { icon: House, bg: '#fdeab8', color: '#064735' },
  banknote: { icon: Banknote, bg: '#d9ebe4', color: '#064735' },
  plane: { icon: Plane, bg: '#e3f2cf', color: '#064735' },
  heart: { icon: Heart, bg: '#fbdcd7', color: '#b8321f' },
  laptop: { icon: Laptop, bg: '#e3f2cf', color: '#064735' },
  gift: { icon: Gift, bg: '#e3f2cf', color: '#064735' },
  target: { icon: Target, bg: '#fdeab8', color: '#064735' },
}
