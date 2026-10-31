// Free vs Moni Plus. The database is the source of truth (plus_entitlements); this file only holds the pure rules the
// UI needs: is the entitlement still running, how to print its end date, and the honest copy of the upsell.

export type PlusGateReason = 'voice' | 'receipt' | 'group' | 'assistant' | 'mp_import' | 'generic'

export const FREE_BADGE = 'Versión Free · sin suscripción'

export const PLUS_PAYMENTS_NOTE =
  'Pagás con Mercado Pago, se renueva cada mes y cancelás cuando quieras. También podés canjear un código de acceso: dura 30 días.'

export const PLUS_PERKS = [
  'Cargá gastos hablando',
  'Escaneá tickets con la cámara',
  'Creá todos los grupos que quieras',
  'Preguntale a Moni por tus números',
] as const

export const PLUS_REASON_COPY: Record<PlusGateReason, { title: string; text: string }> = {
  voice: {
    title: 'Cargar por voz es de Moni Plus',
    text: 'Con Moni Plus le hablás a Moni y arma los gastos por vos. Lo manual sigue siendo gratis.',
  },
  receipt: {
    title: 'Escanear tickets es de Moni Plus',
    text: 'Con Moni Plus sacás una foto y Moni lee el total, la fecha y el comercio. Lo manual sigue siendo gratis.',
  },
  group: {
    title: 'Tu plan Free tiene un grupo',
    text: 'En la versión Free podés crear un grupo. Con Moni Plus creás todos los que quieras. Seguís pudiendo sumarte a los de tus amigos.',
  },
  assistant: {
    title: 'El asistente es de Moni Plus',
    text: 'Con Moni Plus le preguntás a Moni por tus gastos, vencimientos, cuotas y grupos, y te responde con lo que encuentra en tus datos. Lo manual sigue siendo gratis.',
  },
  mp_import: {
    title: 'Importar de Mercado Pago es de Moni Plus',
    text: 'Con Moni Plus tus pagos de Mercado Pago aparecen solos como gastos, ya categorizados. Lo manual sigue siendo gratis.',
  },
  generic: {
    title: 'Pasar a Moni Plus',
    text: 'Moni Plus suma herramientas extra. Lo que ya usás sigue siendo gratis.',
  },
}

/** True while the entitlement end is in the future. Null or an unparsable date means Free. */
export function isPlusActive(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false
  const end = Date.parse(expiresAt)
  return Number.isFinite(end) && end > now.getTime()
}

const AR_TZ = 'America/Argentina/Buenos_Aires'

/** "30/11" (or "30/11/2026" with `withYear`) in Argentina time, whatever the device time zone is. */
export function formatPlusExpiry(iso: string, withYear = false): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const short = `${get('day')}/${get('month')}`
  return withYear ? `${short}/${get('year')}` : short
}

/** Text of the small badge on Home. */
export function plusBadgeText(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (isPlusActive(expiresAt, now) && expiresAt)
    return `Moni Plus · hasta ${formatPlusExpiry(expiresAt)}`
  return FREE_BADGE
}
