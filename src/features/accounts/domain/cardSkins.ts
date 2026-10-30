import { brandForAccountName } from './bankCatalog'

/** Which decorative illustration a card carries (see BrandCardArt). */
export type CardArt =
  | 'bubbles'
  | 'waves'
  | 'flame'
  | 'sunrise'
  | 'orbit'
  | 'rings'
  | 'cross'
  | 'lemon'
  | 'lattice'
  | 'chevrons'
  | 'hexagons'
  | 'arcs'
  | 'id-card'
  | 'stripe'
  | 'discs'
  | 'lines'

/** The little emblem next to the name when the brand has no logo file (the official logo goes in src/assets/brands). */
export type CardGlyph = 'flame' | 'lemon' | 'ring' | 'x' | 'text'

/**
 * Visual identity of a bank or wallet, drawn for Moni: its palette, a graphic motif and an emblem. They are original
 * decorative illustrations inspired by each entity's colors (not copies of its logo or of any physical card), and no card
 * number, expiry or bank data is ever shown on them.
 */
export interface CardSkin {
  /** Catalog id of the brand. */
  id: string
  /** The card background: two stops of the brand color (light to dark), painted as a diagonal gradient. */
  stops: readonly [string, string]
  /** Color of the text on the card: it reaches at least 4.5:1 against both stops. */
  ink: string
  /** Second brand color used by the illustration. */
  accent: string
  art: CardArt
  glyph: CardGlyph
  /** Letters of the emblem when the glyph is "text". */
  badge: string
}

const WHITE = '#FFFFFF'
const DARK = '#06281F'

export const CARD_SKINS: readonly CardSkin[] = [
  {
    id: 'galicia',
    stops: ['#CC4A07', '#B03404'],
    ink: WHITE,
    accent: '#FFB27A',
    art: 'bubbles',
    glyph: 'text',
    badge: 'G',
  },
  {
    id: 'bbva',
    stops: ['#004481', '#0A5CA8'],
    ink: WHITE,
    accent: '#5BC2E7',
    art: 'waves',
    glyph: 'text',
    badge: 'BBVA',
  },
  {
    id: 'santander',
    stops: ['#E10000', '#BA0000'],
    ink: WHITE,
    accent: '#FF8A8A',
    art: 'flame',
    glyph: 'flame',
    badge: '',
  },
  {
    id: 'mercado-pago',
    stops: ['#007DBA', '#00669A'],
    ink: WHITE,
    accent: '#FFE600',
    art: 'sunrise',
    glyph: 'text',
    badge: 'MP',
  },
  {
    id: 'uala',
    stops: ['#3D3BF3', '#2B29D6'],
    ink: WHITE,
    accent: '#FB6868',
    art: 'orbit',
    glyph: 'text',
    badge: 'ualá',
  },
  {
    id: 'brubank',
    stops: ['#7A3DFF', '#5A22D8'],
    ink: WHITE,
    accent: '#C9B0FF',
    art: 'rings',
    glyph: 'text',
    badge: 'bru',
  },
  {
    id: 'naranja-x',
    stops: ['#CD4200', '#AF3500'],
    ink: WHITE,
    accent: '#FFC9A3',
    art: 'cross',
    glyph: 'x',
    badge: '',
  },
  {
    id: 'lemon',
    stops: ['#2FE382', '#12C867'],
    ink: DARK,
    accent: '#F3FF6B',
    art: 'lemon',
    glyph: 'lemon',
    badge: '',
  },
  {
    id: 'banco-nacion',
    stops: ['#0A5CB8', '#00437F'],
    ink: WHITE,
    accent: '#8EC7FF',
    art: 'lattice',
    glyph: 'text',
    badge: 'BNA',
  },
  {
    id: 'macro',
    stops: ['#1B3F94', '#122C6E'],
    ink: WHITE,
    accent: '#FFC629',
    art: 'chevrons',
    glyph: 'text',
    badge: 'M',
  },
  {
    id: 'icbc',
    stops: ['#C4161C', '#9E0F14'],
    ink: WHITE,
    accent: '#FF9EA2',
    art: 'rings',
    glyph: 'ring',
    badge: '',
  },
  {
    id: 'hsbc',
    stops: ['#DB0011', '#B3000E'],
    ink: WHITE,
    accent: '#FFFFFF',
    art: 'hexagons',
    glyph: 'text',
    badge: 'HSBC',
  },
  {
    id: 'banco-provincia',
    stops: ['#00863D', '#006B30'],
    ink: WHITE,
    accent: '#2FD0BF',
    art: 'arcs',
    glyph: 'text',
    badge: 'BP',
  },
  {
    id: 'cuenta-dni',
    stops: ['#00853F', '#006B33'],
    ink: WHITE,
    accent: '#9BE7B8',
    art: 'id-card',
    glyph: 'text',
    badge: 'DNI',
  },
  {
    id: 'visa',
    stops: ['#1A1F71', '#0F1350'],
    ink: WHITE,
    accent: '#F7B600',
    art: 'stripe',
    glyph: 'text',
    badge: 'VISA',
  },
  {
    id: 'mastercard',
    stops: ['#26262B', '#141417'],
    ink: WHITE,
    accent: '#EB001B',
    art: 'discs',
    glyph: 'text',
    badge: 'MC',
  },
  {
    id: 'amex',
    stops: ['#2A6FB5', '#1D5A9C'],
    ink: WHITE,
    accent: '#CFE6FF',
    art: 'lines',
    glyph: 'text',
    badge: 'AX',
  },
]

const BY_ID = new Map(CARD_SKINS.map((skin) => [skin.id, skin]))

export function skinForBrandId(id: string): CardSkin | undefined {
  return BY_ID.get(id)
}

/**
 * The skin of an account, from its name (same exact match the logos use). Cash and custom media have none: they keep
 * Moni's own card colors.
 */
export function skinForAccountName(name: string): CardSkin | undefined {
  const brand = brandForAccountName(name)
  return brand ? BY_ID.get(brand.id) : undefined
}

export function skinBackground(skin: CardSkin): string {
  return `linear-gradient(135deg, ${skin.stops[0]} 0%, ${skin.stops[1]} 100%)`
}

/** Inline style of a branded card: its gradient, its text color and (on dark cards) a soft shadow so the text stays crisp over the art. */
export function skinStyle(skin: CardSkin): {
  background: string
  color: string
  textShadow?: string
} {
  return {
    background: skinBackground(skin),
    color: skin.ink,
    ...(skin.ink === '#FFFFFF' ? { textShadow: '0 1px 2px rgba(0,0,0,0.28)' } : {}),
  }
}

// --- Contrast (WCAG) so every card stays readable ------------------------------------------------

function channel(hex: string, i: number): number {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Lowest contrast of the card text against the card background. */
export function skinContrast(skin: CardSkin): number {
  return Math.min(...skin.stops.map((stop) => contrastRatio(skin.ink, stop)))
}
