import type { StoryTone } from '../domain/stories'

/** Colors of each tone, taken from the Figma bubbles: ring, soft fill and the ink that reads on that fill. */
export const STORY_TONES: Record<StoryTone, { ring: string; fill: string; ink: string }> = {
  gold: { ring: '#f4ad35', fill: '#fbe3a6', ink: '#6b4a12' },
  blush: { ring: '#ea8571', fill: '#f8d3cb', ink: '#8a2f20' },
  blue: { ring: '#64abe6', fill: '#cfe6f7', ink: '#1d4f8c' },
  violet: { ring: '#a090e7', fill: '#e3ddf8', ink: '#3d2a8a' },
  green: { ring: '#5fa36e', fill: '#d5e5c5', ink: '#1e5233' },
}
