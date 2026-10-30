import type { Cents } from '@/shared/lib/money'

/** USD amount to ARS cents at the given rate (ARS per USD), rounded to the nearest centavo. */
export function usdToArsCents(usd: number, rate: number): Cents {
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || usd <= 0 || rate <= 0) {
    throw new Error('usdToArsCents needs positive finite numbers')
  }
  return Math.round(usd * rate * 100)
}

const dayMonth = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** "29/10" for an ISO timestamp, in Argentina time. */
export function formatRateDate(iso: string): string {
  return dayMonth.format(new Date(iso))
}
