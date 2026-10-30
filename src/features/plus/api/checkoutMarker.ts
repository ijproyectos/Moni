// Remembers, across the redirect to Mercado Pago, what Plus end date the person had before paying, so the return page
// can tell "this payment activated Plus" from "they were already Plus". Per-tab convenience only: when storage is
// blocked the page falls back to "any active Plus counts".

const KEY = 'moni.plus.checkout'

interface Marker {
  userId: string
  /** Expiry before checkout; null = was Free. */
  baseline: string | null
}

export function saveCheckoutMarker(userId: string, baseline: string | null): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ userId, baseline } satisfies Marker))
  } catch {
    // Storage unavailable: nothing to do.
  }
}

/** The baseline for this user, or undefined when unknown (no marker, other user, storage blocked). */
export function readCheckoutBaseline(userId: string): string | null | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { userId: owner, baseline } = parsed as Partial<Marker>
    if (owner !== userId) return undefined
    return typeof baseline === 'string' ? baseline : null
  } catch {
    return undefined
  }
}

export function clearCheckoutMarker(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Ignore.
  }
}
