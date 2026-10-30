import { TriangleAlert } from 'lucide-react'
import { formatArs } from '@/shared/lib/money'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import type { CreditLimitWarning } from '../domain/creditLimit'

/** Warning before a card purchase that goes over the limit. The person decides: cancel or continue. */
export function CreditLimitSheet({
  cardName,
  warning,
  installments,
  isBusy,
  onCancel,
  onContinue,
}: {
  cardName: string
  warning: CreditLimitWarning
  /** Set for a purchase in cuotas: the whole amount counts against the limit from the first day. */
  installments?: number
  isBusy?: boolean
  onCancel: () => void
  onContinue: () => void
}) {
  return (
    <DecisionSheet
      icon={<TriangleAlert className="size-6" />}
      title="Te pasás del límite"
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
        Esta compra supera el crédito disponible de <strong>{cardName}</strong>.
        {installments
          ? ` Aunque la pagues en ${installments} cuotas, el total cuenta desde hoy.`
          : ''}{' '}
        Podés continuar: el banco puede rechazarla.
      </p>
      <dl className="mt-4 divide-y divide-sand rounded-[20px] border border-sand bg-card px-4 text-[16px]">
        <Row label="Límite" value={formatArs(warning.limitCents)} />
        <Row label="Deuda actual" value={formatArs(warning.debtCents)} />
        <Row label="Esta compra" value={formatArs(warning.amountCents)} />
        <Row
          label="Disponible resultante"
          value={formatArs(warning.resultingAvailableCents)}
          danger
        />
      </dl>
    </DecisionSheet>
  )
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={danger ? 'font-extrabold text-expense' : 'font-extrabold'}>{value}</dd>
    </div>
  )
}
