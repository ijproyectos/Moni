import { AdminApiError } from '../api/adminRepository'

/** User-facing text for a failed suspension request. */
export function describeSuspendError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.reason === 'cannot_suspend_self') return 'No podés suspender tu propia cuenta.'
    if (error.reason === 'cannot_suspend_admin')
      return 'No se puede suspender a otro administrador.'
    if (error.reason === 'confirmation_mismatch')
      return 'El email escrito no coincide con el de la cuenta.'
    if (error.status === 404) return 'No encontramos a ese usuario.'
  }
  return 'No pudimos completar la acción. Probá de nuevo.'
}

/** User-facing text for a failed "Avisar ahora" (Plus expiry). */
export function describeNotifyError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60))
      return `Llegaste al límite de avisos por hora. Probá de nuevo en ${minutes} min.`
    }
    if (error.reason === 'already_notified') return 'Ya se le avisó por este vencimiento.'
    if (error.reason === 'not_expiring')
      return 'Esta persona ya no figura entre las que pierden Plus: renovó o se actualizó su suscripción.'
    if (error.reason === 'server_misconfigured')
      return 'Los avisos push no están configurados en el servidor.'
  }
  return 'No pudimos enviar el aviso. Probá de nuevo.'
}

/** Text for the days left of a Plus expiry. */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

/** Whether the typed text equals the account email (the guard of the suspend button). */
export function emailConfirmed(typed: string, email: string | null): boolean {
  return Boolean(email) && typed.trim().toLowerCase() === (email ?? '').trim().toLowerCase()
}
