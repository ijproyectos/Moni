import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import { useRecordSettlementReceipt } from '../api/useGroups'
import { fieldClass, labelClass } from './styles'

interface ReceiptSheetProps {
  settlementId: string
  onClose: () => void
}

/** "Registrar en una cuenta": the receiver of a settlement picks where the money landed. */
export function ReceiptSheet({ settlementId, onClose }: ReceiptSheetProps) {
  const accounts = useAccounts()
  const record = useRecordSettlementReceipt()
  const toast = useToast()
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const list = accounts.data ?? []
  const selected = accountId || list[0]?.id || ''

  async function submit() {
    setError(null)
    try {
      await record.mutateAsync({ settlementId, accountId: selected })
      toast.show('Cobro registrado', { mascotUrl: mascotHappy })
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Registrar en una cuenta" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[16px] leading-6 text-text-muted">
          Elegí en qué cuenta entró la plata. No cuenta como ingreso: solo suma al saldo de la
          cuenta.
        </p>
        {accounts.isError ? (
          <p role="alert" className="text-center text-sm text-expense">
            No pudimos cargar tus cuentas. Probá de nuevo en un rato.
          </p>
        ) : list.length === 0 && !accounts.isLoading ? (
          <p className="text-center text-text-muted">Primero creá una cuenta en Medios de pago.</p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Cuenta</span>
            <select
              className={fieldClass}
              value={selected}
              onChange={(event) => setAccountId(event.target.value)}
              data-autofocus
            >
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button
          variant="dark"
          disabled={!selected || record.isPending}
          onClick={() => void submit()}
        >
          {record.isPending ? 'Guardando…' : 'Registrar'}
        </Button>
      </div>
    </BottomSheet>
  )
}
