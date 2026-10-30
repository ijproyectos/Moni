import { TriangleAlert } from 'lucide-react'
import { formatArs } from '@/shared/lib/money'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import type { OverdraftWarning } from '../domain/overdraft'

interface OverdraftSheetProps {
  accountName: string
  warning: OverdraftWarning
  /** Spends say "gasto"; transfers say "transferencia". */
  movement?: 'expense' | 'transfer'
  isBusy?: boolean
  onCancel: () => void
  onContinue: () => void
}

/** Warning before a spend that leaves an account in negative. The person decides: cancel or continue. */
export function OverdraftSheet({
  accountName,
  warning,
  movement = 'expense',
  isBusy,
  onCancel,
  onContinue,
}: OverdraftSheetProps) {
  return (
    <DecisionSheet
      icon={<TriangleAlert className="size-6" />}
      title="Te falta saldo"
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
        {movement === 'transfer' ? 'Esta transferencia' : 'Este gasto'} es mayor que lo que tenés en{' '}
        <strong>{accountName}</strong>. Si seguís, la cuenta queda en negativo.
      </p>
      <dl className="mt-4 divide-y divide-sand rounded-[20px] border border-sand bg-card px-4 text-[16px]">
        <Row label="Saldo actual" value={formatArs(warning.balanceCents)} />
        <Row
          label={movement === 'transfer' ? 'Transferencia' : 'Gasto'}
          value={formatArs(-warning.amountCents)}
        />
        <Row label="Saldo resultante" value={formatArs(warning.resultingCents)} danger />
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
