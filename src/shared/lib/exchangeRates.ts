// Tasas de cambio con base ARS (las usa "Moneda de visualización" para convertir lo que ya está
// guardado en pesos, SOLO para mostrarlo distinto — nunca se escribe nada convertido). Open ER-API es
// gratis, sin API key, cubre ~160 monedas y se actualiza una vez por día.

export const EXCHANGE_RATES_URL = 'https://open.er-api.com/v6/latest/ARS'
export const RATE_TIMEOUT_MS = 6_000

export interface ExchangeRates {
  /** Unidades de cada moneda por 1 ARS (rates.USD === cuántos USD vale 1 ARS). Incluye rates.ARS === 1. */
  rates: Record<string, number>
  /** ISO timestamp de cuándo se actualizaron estas tasas en el servidor de la API. */
  updatedAt: string
}

/** Valida el payload; devuelve null si algo no cierra (nunca se asume una tasa). */
export function parseExchangeRates(payload: unknown): ExchangeRates | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { result, base_code, rates, time_last_update_utc } = payload as Record<string, unknown>
  if (result !== 'success' || base_code !== 'ARS') return null
  if (typeof rates !== 'object' || rates === null) return null
  if (typeof time_last_update_utc !== 'string') return null
  const entries = Object.entries(rates as Record<string, unknown>).filter(
    ([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  ) as [string, number][]
  if (entries.length === 0) return null
  const parsedDate = new Date(time_last_update_utc)
  if (Number.isNaN(parsedDate.getTime())) return null
  return { rates: Object.fromEntries(entries), updatedAt: parsedDate.toISOString() }
}

/** Trae las tasas con timeout. Tira si falla la red, el timeout, el status o el payload no es válido. */
export async function fetchExchangeRates(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = RATE_TIMEOUT_MS,
): Promise<ExchangeRates> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(EXCHANGE_RATES_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Exchange rates unavailable (${response.status})`)
    const parsed = parseExchangeRates(await response.json())
    if (!parsed) throw new Error('Exchange rates response was not valid')
    return parsed
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Convierte centavos en ARS a centavos en otra moneda usando `rates` (unidades de esa moneda por 1 ARS).
 * Devuelve null si no hay tasa para esa moneda (el caller debe mostrar ARS sin convertir en ese caso).
 */
export function convertArsCents(cents: number, targetCode: string, rates: Record<string, number>): number | null {
  const rate = rates[targetCode]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null
  return Math.round(cents * rate)
}
