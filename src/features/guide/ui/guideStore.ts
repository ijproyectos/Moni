import { useSyncExternalStore } from 'react'

/** Whether the person asked to see the tour again (Configuración › Conocé Moni). Plain store: no provider needed. */
let requested = false
let active = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function requestGuide() {
  requested = true
  emit()
}
export function consumeGuideRequest() {
  requested = false
  emit()
}
export function setGuideActive(value: boolean) {
  if (active === value) return
  active = value
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const useGuideRequested = () => useSyncExternalStore(subscribe, () => requested)
/** True while the tour is on screen (other floating cards step aside). */
export const useGuideActive = () => useSyncExternalStore(subscribe, () => active)
