import { onlineManager } from '@tanstack/react-query'

/** Shown wherever a write is attempted (or disabled) without a connection. */
export const OFFLINE_MESSAGE = 'Sin conexión. Conectate para guardar cambios.'

/**
 * Raised before any request when a write is attempted offline. The app has no write queue on
 * purpose: most RPCs have no idempotency keys, so replaying them later could duplicate money.
 */
export class OfflineError extends Error {
  constructor() {
    super(OFFLINE_MESSAGE)
    this.name = 'OfflineError'
  }
}

export function isOffline(): boolean {
  return !onlineManager.isOnline()
}

/** Central write guard: throws OfflineError when there is no connection. */
export function assertOnline(): void {
  if (isOffline()) throw new OfflineError()
}

/**
 * TanStack assumes "online" until it sees an event, so a page loaded without a connection must be
 * told. Called once when the app boots.
 */
export function syncInitialOnlineState(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    onlineManager.setOnline(navigator.onLine)
  }
}
