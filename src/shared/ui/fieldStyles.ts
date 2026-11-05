/** One look for every text field of the app (Figma): tall, softly rounded, on the card surface. */
export const FIELD_CLASS =
  'h-14 w-full min-w-0 rounded-[18px] border border-line bg-card px-4 text-[17px] text-ink placeholder:text-text-muted focus-visible:border-forest dark:focus-visible:border-lime'

/** Active look of the Gasto / Ingreso switch: the semantic colors, readable on both themes. */
export const KIND_ACTIVE = {
  expense: 'bg-expense text-card',
  income: 'bg-income text-card',
} as const
