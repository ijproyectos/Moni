import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'

/**
 * Category icons, "option A": the colored drawings of the system's emoji font, shown over the category's soft colored circle.
 * The stored icon names never change; each name just maps to its drawing here. An unknown name falls back to the generic tag.
 */
const EMOJI: Record<string, string> = {
  Utensils: '🍔',
  ShoppingCart: '🛒',
  BusFront: '🚌',
  Car: '🚗',
  Fuel: '⛽',
  Martini: '🍸',
  Coffee: '☕',
  RefreshCw: '🔄',
  Heart: '❤️',
  Pill: '💊',
  Tv: '📺',
  Gamepad2: '🎮',
  Music: '🎵',
  House: '🏠',
  Wrench: '🔧',
  Send: '💸',
  Plane: '✈️',
  PawPrint: '🐾',
  Sparkles: '✨',
  Shirt: '👕',
  Baby: '🍼',
  Dumbbell: '🏋️',
  GraduationCap: '🎓',
  Phone: '📱',
  Zap: '💡',
  Wallet: '👛',
  Banknote: '💵',
  Briefcase: '💼',
  Laptop: '💻',
  TrendingUp: '📈',
  PiggyBank: '🐷',
  Gift: '🎁',
  Tag: '🏷️',
}

export const CATEGORY_ART_NAMES: readonly string[] = Object.keys(EMOJI)

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

function makeIcon(emoji: string): LucideIcon {
  function CategoryEmoji({ className, style }: { className?: string; style?: CSSProperties }) {
    const css: CSSProperties = {
      fontFamily: EMOJI_FONT,
      fontSize: '21px',
      lineHeight: 1,
      fontStyle: 'normal',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }
    return (
      <span aria-hidden="true" className={className} style={css}>
        {emoji}
      </span>
    )
  }
  return CategoryEmoji as unknown as LucideIcon
}

const BY_NAME: Record<string, LucideIcon> = Object.fromEntries(Object.entries(EMOJI).map(([n, e]) => [n, makeIcon(e)]))

/** The drawing of a stored category icon name, or undefined when there is none. */
export function categoryArt(name: string | null | undefined): LucideIcon | undefined {
  return name ? BY_NAME[name] : undefined
}
