import type { StoryTone } from '../domain/stories'

/** Colors of each tone, taken from the Figma bubbles: ring, soft fill and the ink that reads on that fill. */
export const STORY_TONES: Record<StoryTone, { ring: string; fill: string; ink: string }> = {
  gold: { ring: '#E3B23C', fill: '#B88A1E', ink: '#FFFFFF' },
  blush: { ring: '#E3B23C', fill: '#C2503F', ink: '#FFFFFF' },
  blue: { ring: '#E3B23C', fill: '#3F7BA6', ink: '#FFFFFF' },
  violet: { ring: '#E3B23C', fill: '#7A62C8', ink: '#FFFFFF' },
  green: { ring: '#E3B23C', fill: '#1B7F4E', ink: '#FFFFFF' },
  orange: { ring: '#E3B23C', fill: '#D9782A', ink: '#FFFFFF' },
}

/**
 * Full screen background per tone (dark to mid so white text reads, 4.5:1 or better at both ends) and the accent of the
 * charts. Cobros green, Debés coral, Metas blue, Gastos orange, Logros violet.
 */
export interface StoryView {
  bg: string
  ink: string
  card: string
  cardInk: string
  button: string
  buttonInk: string
  /** Fill of bars and progress, light enough to stand out on the background. */
  accent: string
}
const view = (from: string, to: string, accent: string, buttonInk: string): StoryView => ({
  bg: `linear-gradient(180deg, ${from} 0%, ${to} 100%)`,
  ink: '#FFFFFF',
  card: 'rgba(255,255,255,0.14)',
  cardInk: '#FFFFFF',
  button: '#FFFFFF',
  buttonInk,
  accent,
})
export const STORY_VIEW: Record<StoryTone, StoryView> = {
  green: view('#08432E', '#1F7A4F', '#9FE3BC', '#08432E'),
  blush: view('#7A2318', '#B84A3A', '#FFC2B5', '#7A2318'),
  blue: view('#143D5C', '#2F6D9C', '#A9D3F2', '#143D5C'),
  orange: view('#7A3306', '#B85A12', '#FFD1A0', '#7A3306'),
  violet: view('#35266F', '#6650B3', '#D7CBFF', '#35266F'),
  gold: view('#5F4200', '#9A6F0E', '#FFE58A', '#5F4200'),
}

/** Unseen ring of a bubble (Menta conic gradient) and the grey of a story already seen. */
export const RING_UNSEEN = 'conic-gradient(#E3B23C, #F3DC96, #B58E2E, #E3B23C)'
export const RING_SEEN = '#C7D6CB'
