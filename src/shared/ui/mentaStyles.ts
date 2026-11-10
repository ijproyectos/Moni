import { FOCUS_RING } from './focusRing'

/** Mint pill button of the Menta design (add the height and the text size/weight where it is used). */
export const MINT_PILL = `inline-flex w-full items-center justify-center gap-2 rounded-full bg-mint font-display text-white transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`

/** White pill button of the Menta design (secondary action). */
export const WHITE_PILL = `inline-flex items-center justify-center gap-2 rounded-full bg-card font-display text-ink transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`
