import type { Cents } from '@/shared/lib/money'

export interface HomeBalance {
  /** The real sum of the payment methods (same calculation as always). */
  totalCents: Cents
  methodCount: number
  /** Where most of the money is: the payment method and its share (0-100) of the money you have. Null without money. */
  top?: { name: string; percent: number } | null
}

/** "2 medios · el 97% está en Galicia": the real distribution of the money. */
export function distributionLabel({ methodCount, top }: HomeBalance): string {
  const medios = `${methodCount} ${methodCount === 1 ? 'medio' : 'medios'}`
  return top ? `${medios} · el ${top.percent}% está en ${top.name}` : medios
}
