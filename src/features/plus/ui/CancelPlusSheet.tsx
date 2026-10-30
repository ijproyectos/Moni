import { CalendarX } from 'lucide-react'
import { useState } from 'react'
import { toUserMessage } from '@/shared/lib/errors'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { useCancelSubscription } from '../api/useBilling'
import { formatPlusExpiry } from '../domain/plus'

interface CancelPlusSheetProps {
  /** When the paid period ends (ISO), or null when unknown. Plus keeps running until then. */
  expiresAt: string | null
  onClose: () => void
}

/** Confirm step for "Cancelar suscripción". Cancelling stops future charges; it does not remove paid time. */
export function CancelPlusSheet({ expiresAt, onClose }: CancelPlusSheetProps) {
  const cancel = useCancelSubscription()
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (cancel.isPending) return
    setError(null)
    try {
      await cancel.mutateAsync()
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <DecisionSheet
      icon={<CalendarX className="size-6" />}
      title="¿Cancelar la suscripción?"
      onClose={onClose}
      actions={[
        { label: 'Mejor no', onClick: onClose },
        {
          label: cancel.isPending ? 'Cancelando…' : 'Sí, cancelar',
          tone: 'danger',
          onClick: () => void confirm(),
          disabled: cancel.isPending,
        },
      ]}
    >
      <p>
        No se te va a cobrar más.{' '}
        {expiresAt
          ? `Seguís con Moni Plus hasta el ${formatPlusExpiry(expiresAt, true)}.`
          : 'Seguís con Moni Plus hasta que termine el período que ya pagaste.'}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-expense">
          {error}
        </p>
      )}
    </DecisionSheet>
  )
}
