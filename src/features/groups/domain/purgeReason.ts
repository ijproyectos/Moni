import { toUserMessage } from '@/shared/lib/errors'

/** Why one group could not be deleted for good, in plain words (the server's reason, never a generic «algo salió mal»). */
export function purgeReason(error: unknown): string {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? ((error as { message: string }).message) : ''
  if (message.includes('balance_not_zero')) return 'todavía tenés saldo pendiente en el grupo: saldalo y volvé a intentar.'
  if (message.includes('open_payment_reports')) return 'hay pagos sin confirmar: confirmalos o rechazalos primero.'
  if (message.includes('last_admin')) return 'sos la única persona administradora: nombrá a otra antes de eliminarlo.'
  if (message.includes('group_not_removed')) return 'primero tenés que quitarlo de tu lista.'
  if (message.includes('not_group_member')) return 'ya no formás parte de este grupo.'
  const known = toUserMessage(error)
  // An unknown server error: say it did not work and that nothing was deleted or changed.
  return known.startsWith('Algo salió mal') ? 'no pudimos eliminarlo en el servidor y no se borró nada. Probá de nuevo; si sigue, avisanos.' : known.charAt(0).toLowerCase() + known.slice(1)
}
