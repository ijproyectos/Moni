import { useState } from 'react'
import mascotAttentive from '@/assets/mascot/expresion_atento.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import type { useParseReceipt } from '@/features/ai/api/useParseReceipt'
import { toDrafts, warningsNotice, type ParseResponse } from '@/features/ai/domain/draft'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { DraftConfirmation } from './DraftConfirmation'

interface ReceiptScanProps {
  scan: ReturnType<typeof useParseReceipt>
  /** Opens the camera / file picker again. */
  onRetry: () => void
  onClose: () => void
}

/**
 * "Sacar foto": analyzing state (with cancel), error state, and the shared confirmation list prefilled from the
 * receipt. Nothing is saved until the person taps "Guardar" in the list.
 */
export function ReceiptScan({ scan, onRetry, onClose }: ReceiptScanProps) {
  const accountsQuery = useAccounts()

  function cancel() {
    scan.cancel()
    onClose()
  }

  if (scan.isError) {
    return (
      <BottomSheet title="No pudimos leer la factura" onClose={onClose}>
        <p role="alert" className="text-[16px] leading-6 text-expense">
          {toUserMessage(scan.error)}
        </p>
        <Button variant="dark" className="mt-4" onClick={onRetry}>
          Probar con otra foto
        </Button>
        <div className="mt-1 flex justify-center">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </BottomSheet>
    )
  }

  if (scan.isSuccess && !accountsQuery.isLoading) {
    return <ReceiptConfirmation response={scan.data} onClose={onClose} />
  }

  return (
    <BottomSheet title="Analizando tu factura…" onClose={() => cancel()}>
      <div className="flex flex-col items-center gap-3 text-center">
        <img src={mascotAttentive} alt="" className="size-28 motion-safe:animate-pulse" />
        <p role="status" className="text-[16px] leading-6 text-text-muted">
          Estoy leyendo el total, la fecha y el comercio. Puede tardar unos segundos.
        </p>
      </div>
      <Button variant="ghost" className="mt-3 w-full" onClick={() => cancel()}>
        Cancelar
      </Button>
    </BottomSheet>
  )
}

function ReceiptConfirmation({
  response,
  onClose,
}: {
  response: ParseResponse
  onClose: () => void
}) {
  const accounts = useAccounts().data ?? []
  // Drafts are computed once: from then on the confirmation list owns (and edits) them.
  const [drafts] = useState(() => toDrafts(response, accounts[0]?.id ?? ''))
  const [notice] = useState(() => warningsNotice(response.warnings))
  return (
    <DraftConfirmation
      initialDrafts={drafts}
      notice={notice}
      intro="Esto es lo que leí en la factura. Corregí lo que haga falta: no se guarda nada hasta que lo confirmes."
      onClose={onClose}
    />
  )
}
