/**
 * Text size for a pair of amounts shown side by side (Gastos / Ingresos). Both amounts share the size, driven by the
 * longest one, so they read as a set and a long figure shrinks the pair together instead of wrapping or being cut.
 * The classes are literal so Tailwind can see them.
 */
const PAIR_SIZES = {
  home: ['text-[22px]', 'text-[18px]', 'text-[16px]', 'text-[14px]'],
  activity: ['text-[26px]', 'text-[22px]', 'text-[18px]', 'text-[15px]'],
} as const

/** `longest` is the length, in characters, of the longest formatted amount (0 when amounts are hidden). */
export function pairAmountSize(longest: number, layout: keyof typeof PAIR_SIZES): string {
  const sizes = PAIR_SIZES[layout]
  if (longest <= 11) return sizes[0]
  if (longest <= 13) return sizes[1]
  if (longest <= 16) return sizes[2]
  return sizes[3]
}
