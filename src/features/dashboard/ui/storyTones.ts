import type { StoryTone } from '../domain/stories'

/** Colors of each tone, taken from the Figma bubbles: ring, soft fill and the ink that reads on that fill. */
export const STORY_TONES: Record<StoryTone, { ring: string; fill: string; ink: string }> = {
  gold: { ring: '#f4ad35', fill: '#fbe3a6', ink: '#6b4a12' },
  blush: { ring: '#ea8571', fill: '#f8d3cb', ink: '#8a2f20' },
  blue: { ring: '#64abe6', fill: '#cfe6f7', ink: '#1d4f8c' },
  violet: { ring: '#a090e7', fill: '#e3ddf8', ink: '#3d2a8a' },
  green: { ring: '#5e9c84', fill: '#cde6da', ink: '#163832' },
}

/** Menta palette of the full screen viewer, per tone: background, ink, the tint of the "Qué pasó" card and its ink. */
export const STORY_VIEW: Record<
  StoryTone,
  { bg: string; ink: string; card: string; cardInk: string; button: string; buttonInk: string }
> = {
  green: {
    bg: '#1F8A5B',
    ink: '#FFFFFF',
    card: '#17734B',
    cardInk: '#FFFFFF',
    button: '#FFFFFF',
    buttonInk: '#0F5A36',
  },
  gold: {
    bg: '#FFE58A',
    ink: '#3D2E00',
    card: '#FFF0B8',
    cardInk: '#3D2E00',
    button: '#3D2E00',
    buttonInk: '#FFF0B8',
  },
  blush: {
    bg: '#F6DEDA',
    ink: '#5C1B14',
    card: '#FBEFEC',
    cardInk: '#5C1B14',
    button: '#9E2F24',
    buttonInk: '#FFFFFF',
  },
  blue: {
    bg: '#E0ECF7',
    ink: '#1B3F63',
    card: '#F3F8FC',
    cardInk: '#1B3F63',
    button: '#285A86',
    buttonInk: '#FFFFFF',
  },
  violet: {
    bg: '#C9BDF7',
    ink: '#211A4A',
    card: '#ECE8FA',
    cardInk: '#211A4A',
    button: '#211A4A',
    buttonInk: '#ECE8FA',
  },
}

/** Unseen ring of a bubble (Menta conic gradient) and the grey of a story already seen. */
export const RING_UNSEEN = 'conic-gradient(#1F8A5B, #C9BDF7, #FFE58A, #1F8A5B)'
export const RING_SEEN = '#C7D6CB'
