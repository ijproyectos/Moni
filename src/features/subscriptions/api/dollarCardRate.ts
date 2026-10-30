// Dólar tarjeta rate (what the bank charges for dollar card purchases), from the public dolarapi.com API
// (no key, CORS open). The value is never assumed: if it cannot be fetched and validated, callers get none.

export const DOLLAR_CARD_URL = 'https://dolarapi.com/v1/dolares/tarjeta'
export const RATE_TIMEOUT_MS = 6_000

/** Sanity bounds for ARS per USD: anything outside is treated as a bad response, not a rate. */
const MIN_RATE = 1
const MAX_RATE = 100_000

export interface DollarCardRate {
  /** ARS per USD, what a person pays ("venta"). */
  sell: number
  /** ISO timestamp of the quote, as published by the API. */
  updatedAt: string
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/** Validates the API payload; returns null when anything is off. */
export function parseDollarCardRate(payload: unknown): DollarCardRate | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { moneda, casa, venta, fechaActualizacion } = payload as Record<string, unknown>
  if (moneda !== 'USD' || casa !== 'tarjeta') return null
  if (typeof venta !== 'number' || !Number.isFinite(venta)) return null
  if (venta < MIN_RATE || venta > MAX_RATE) return null
  if (typeof fechaActualizacion !== 'string' || !ISO_DATE_TIME.test(fechaActualizacion)) return null
  if (Number.isNaN(Date.parse(fechaActualizacion))) return null
  return { sell: venta, updatedAt: fechaActualizacion }
}

/** Fetches the rate with a timeout. Throws on network failure, timeout, bad status or invalid payload. */
export async function fetchDollarCardRate(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = RATE_TIMEOUT_MS,
): Promise<DollarCardRate> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(DOLLAR_CARD_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Dollar rate unavailable (${response.status})`)
    const rate = parseDollarCardRate(await response.json())
    if (!rate) throw new Error('Dollar rate response was not valid')
    return rate
  } finally {
    clearTimeout(timer)
  }
}
