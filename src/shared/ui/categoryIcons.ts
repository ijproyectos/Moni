import {
  Baby,
  Banknote,
  BusFront,
  Car,
  Coffee,
  Dumbbell,
  Fuel,
  Gamepad2,
  GraduationCap,
  Gift,
  Heart,
  House,
  Laptop,
  Martini,
  Music,
  PawPrint,
  Phone,
  Pill,
  PiggyBank,
  Plane,
  RefreshCw,
  Send,
  Shirt,
  ShoppingCart,
  Sparkles,
  Tag,
  Tv,
  TrendingUp,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'

/** Curated icon set for categories. Names are stored in the database as-is. */
const ICONS: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  BusFront,
  Car,
  Fuel,
  Martini,
  Coffee,
  RefreshCw,
  Heart,
  Pill,
  Tv,
  Gamepad2,
  Music,
  House,
  Wrench,
  Send,
  Plane,
  PawPrint,
  Sparkles,
  Shirt,
  Baby,
  Dumbbell,
  GraduationCap,
  Phone,
  Zap,
  Wallet,
  Banknote,
  Briefcase,
  Laptop,
  TrendingUp,
  PiggyBank,
  Gift,
  Tag,
}

export const CATEGORY_ICON_NAMES: readonly string[] = Object.keys(ICONS)

/** Falls back to a generic tag for unknown names so a bad row never breaks a list. */
export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Tag
}

/** Brand category palette (see docs/SPRINT_2.md). */
export const CATEGORY_COLORS: readonly string[] = [
  '#E5533D',
  '#F0AA2A',
  '#6DBE3A',
  '#064735',
  '#2F9E8F',
  '#1F9FC4',
  '#4F86D9',
  '#8A6BD1',
  '#D96BA8',
  '#E0627A',
  '#B8864B',
  '#E8743B',
  '#0E8A6D',
  '#3E7CB1',
  '#7A6AD8',
]

export const DEFAULT_CATEGORY_COLOR = '#2F9E8F'

/** Light tint of a category color for icon circles ("#E5533D" -> 15% alpha). */
export function tint(color: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}26` : 'transparent'
}

/** Picks forest or white text for legibility on a category color. */
export function readableOn(color: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return '#064735'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#064735' : '#ffffff'
}
