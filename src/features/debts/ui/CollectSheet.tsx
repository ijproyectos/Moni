import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import {
  canHoldTransferData,
  hasTransferData,
  transferLines,
} from '@/features/accounts/domain/account'
import { TransferDataSection } from '@/features/accounts/ui/TransferDataSection'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { copyText, whatsappUrl } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { CheckDot, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useRemindDebt } from '../api/useDebts'
import { buildDebtMessage, toReceiveAccount, type PendingDebt } from '../domain/debts'

/**
 * "Enviar cobro": the person who is owed picks which of their own banks or wallets receives the transfer (cash is not
 * offered), can add the alias / CBU-CVU right there, sees the exact message (it changes with the chosen account) and only
 * then sends it: inside Moni, through the device's share menu, or copied. Nothing is shared before that tap, and
 * sending a charge never touches balances or records a payment.
 */
export function CollectSheet({ debt, onClose }: { debt: PendingDebt; onClose: () => void }) {
  const toast = useToast()
  const accounts = useAccounts()
  const remind = useRemindDebt()
  const [pickId, setPickId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Banks and wallets only: a transfer can not go to cash (nor to a credit card).
  const options = (accounts.data ?? []).filter(canHoldTransferData)
  const picked = options.find((a) => a.id === pickId && hasTransferData(a)) ?? null
  const account = picked ? toReceiveAccount(picked) : null
  const message = buildDebtMessage({
    debtorName: debt.otherName,
    groupName: debt.groupName,
    amountCents: debt.amountCents,
    account,
  })
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function sendInMoni() {
    setError(null)
    try {
      await remind.mutateAsync({
        groupId: debt.groupId,
        debtorId: debt.otherUserId,
        amountCents: debt.amountCents,
        account,
      })
      toast.show(`Le enviamos el cobro a ${debt.otherName}`)
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  async function share() {
    // Devices without the native share menu (desktop) open WhatsApp with the message ready to send.
    if (!canShare) {
      window.open(whatsappUrl(message), '_blank', 'noopener,noreferrer')
      return
    }
    try {
      await navigator.share({ text: message })
    } catch {
      // The person closed the share menu.
    }
  }

  return (
    <BottomSheet
      title="Enviar cobro"
      subtitle={`${debt.otherName} · ${debt.groupName} · ${formatArs(debt.amountCents)}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Dónde querés recibir la transferencia?</SectionLabel>
        <ul className="flex flex-col gap-2">
          {options.map((a) => {
            const withData = hasTransferData(a)
            const selected = picked?.id === a.id
            return (
              <li key={a.id}>
                {addingId === a.id ? (
                  <TransferDataSection
                    account={a}
                    editing
                    onEdit={() => undefined}
                    onDone={() => {
                      setAddingId(null)
                      setPickId(a.id)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => (withData ? setPickId(a.id) : setAddingId(a.id))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[20px] border-2 bg-white px-4 py-3 text-left',
                      selected ? 'border-ink' : 'border-sand',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[18px] font-extrabold">{a.name}</span>
                      <span className="block break-all text-[15px] text-text-muted">
                        {withData ? transferLines(a).join(' · ') : 'Sin alias ni CBU/CVU · Agregar'}
                      </span>
                    </span>
                    <CheckDot checked={selected} />
                  </button>
                )}
              </li>
            )
          })}
          <li>
            <button
              type="button"
              aria-pressed={picked === null}
              onClick={() => setPickId(null)}
              className={cn(
                'flex w-full items-center gap-3 rounded-[20px] border-2 bg-white px-4 py-3 text-left',
                picked === null ? 'border-ink' : 'border-sand',
              )}
            >
              <span className="flex-1 text-[17px] font-extrabold">
                No incluir datos para transferir
              </span>
              <CheckDot checked={picked === null} />
            </button>
          </li>
        </ul>
        {options.length === 0 && (
          <p className="text-[15px] leading-5 text-text-muted">
            Todavía no tenés bancos ni billeteras cargados.{' '}
            <Link to="/cuentas" onClick={onClose} className="font-extrabold text-ink underline">
              Agregar un medio de pago
            </Link>
          </p>
        )}

        <SectionLabel>Así va a salir</SectionLabel>
        <p
          aria-label="Mensaje"
          className="whitespace-pre-line break-words rounded-[20px] bg-lime/30 p-4 text-[16px] leading-6"
        >
          {message}
        </p>

        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button variant="dark" onClick={() => void sendInMoni()} disabled={remind.isPending}>
            {remind.isPending ? 'Enviando…' : 'Enviar por Moni'}
          </Button>
          <Button
            variant="ghost"
            className="border-2 border-sand"
            onClick={() => void share()}
          >
            <Share2 aria-hidden="true" className="mr-2 size-5" /> Compartir
          </Button>
          <Button
            variant="ghost"
            className="border-2 border-sand"
            onClick={() => void copyText(message, toast, 'Mensaje copiado')}
          >
            Copiar mensaje
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
