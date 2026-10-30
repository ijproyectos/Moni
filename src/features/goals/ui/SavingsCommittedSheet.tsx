import { PiggyBank } from 'lucide-react'
import { formatArs } from '@/shared/lib/money'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import type { SavingsCommittedWarning } from '../domain/savings'

/**
 * Warning before a movement that would leave an account under the money its goals reserve. It never blocks and never
 * touches the reserves: the person cancels or goes on, and decides later whether to lower them.
 */
export function SavingsCommittedSheet({
  warning,
  isBusy,
  onCancel,
  onContinue,
}: {
  warning: SavingsCommittedWarning
  isBusy?: boolean
  onCancel: () => void
  onContinue: () => void
}) {
  return (
    <DecisionSheet
      icon={<PiggyBank className="size-6" />}
      title="Ojo con tus ahorros"
      onClose={onCancel}
      actions={[
        { label: 'Cancelar', onClick: onCancel, disabled: isBusy },
        {
          label: isBusy ? 'Guardando…' : 'Continuar igual',
          tone: 'outline',
          onClick: onContinue,
          disabled: isBusy,
        },
      ]}
    >
      <p>
        Tenés <strong>{formatArs(warning.reservedCents)}</strong> reservados para tus metas en{' '}
        <strong>{warning.accountName}</strong>. Con este movimiento el saldo quedaría en{' '}
        <strong>{formatArs(warning.resultingCents)}</strong> y te faltarían{' '}
        <strong>{formatArs(warning.shortfallCents)}</strong> para cubrirlos.
      </p>
      <p className="mt-3 text-[15px] leading-5 text-text-muted">
        Podés seguir: no tocamos tus reservas. Después decidís si querés bajarlas.
      </p>
    </DecisionSheet>
  )
}
