import type { StoryTone } from '../domain/stories'

/** Colors of each tone, taken from the Figma bubbles: ring, soft fill and the ink that reads on that fill. */
export const STORY_TONES: Record<StoryTone, { ring: string; fill: string; ink: string }> = {
  gold: { ring: '#E3B23C', fill: '#B08D3A', ink: '#FFFFFF' },
  blush: { ring: '#E3B23C', fill: '#B5382A', ink: '#FFFFFF' },
  blue: { ring: '#E3B23C', fill: '#416F8E', ink: '#FFFFFF' },
  violet: { ring: '#E3B23C', fill: '#6B5A9E', ink: '#FFFFFF' },
  green: { ring: '#E3B23C', fill: '#1B7F4E', ink: '#FFFFFF' },
}

/** Menta palette of the full screen viewer, per tone: background, ink, the tint of the "Qué pasó" card and its ink. */
const VIEW_DARK = {
  bg: 'linear-gradient(180deg, #254638 0%, #5B7A6B 100%)',
  ink: '#FFFFFF',
  card: 'rgba(255,255,255,0.12)',
  cardInk: '#FFFFFF',
  button: '#FFFFFF',
  buttonInk: '#0B3D2E',
}
export const STORY_VIEW: Record<
  StoryTone,
  { bg: string; ink: string; card: string; cardInk: string; button: string; buttonInk: string }
> = { green: VIEW_DARK, gold: VIEW_DARK, blush: VIEW_DARK, blue: VIEW_DARK, violet: VIEW_DARK }

/** Unseen ring of a bubble (Menta conic gradient) and the grey of a story already seen. */
export const RING_UNSEEN = 'conic-gradient(#E3B23C, #F3DC96, #B58E2E, #E3B23C)'
export const RING_SEEN = '#C7D6CB'
