import { formatLongDate } from '@/shared/lib/dates'

/** The day a badge was earned, in Argentina's calendar day (what the person lived): "15 de enero de 2027". */
export function earnedOn(iso: string): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
  return formatLongDate(day)
}
