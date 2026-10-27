import { Banknote, Bell, ChevronRight, Copy, CreditCard, WalletCards } from 'lucide-react'
import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { copyText } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { Avatar, ChoiceChip, MoniSays, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateSettlement } from '../api/useGroups'
import { settlementFormSchema } from '../domain/group'
import { personName, type Person } from '../domain/ledger'
import type { Transfer } from '../domain/split'
import { addSimSettlement } from '../mock/overlayStore'

const METHODS = [
  { label: 'Transferencia', icon: CreditCard },
  { label: 'Efectivo', icon: Banknote },
  { label: 'Billetera', icon: WalletCards },
]

interface SettleUpSheetProps {
  groupId: string
  meId: string
  people: readonly Person[]
  /** Suggested payments; the person picks one when there are several. */
  transfers: readonly Transfer[]
  onClose: () => void
}

// Screen 062 — Saldar cuentas. When I pay, it is a real settlement; when someone else pays me
// (or someone without Moni is involved) it is recorded in the in-memory overlay.
export function SettleUpSheet({ groupId, meId, people, transfers, onClose }: SettleUpSheetProps) {
  const toast = useToast()
  const create = useCreateSettlement()
  const accounts = useAccounts()
  const mine = transfers.filter((t) => t.fromUserId === meId || t.toUserId === meId)
  const [index, setIndex] = useState(0)
  const [method, setMethod] = useState('Transferencia')
  const [error, setError] = useState<string | null>(null)
  const transfer = (mine.length ? mine : transfers)[index]

  if (!transfer) {
    return (
      <BottomSheet title="Saldar cuentas" onClose={onClose}>
        <p className="py-6 text-center text-[17px]">¡Están a mano! No hay nada para saldar.</p>
        <Button onClick={onClose}>Listo</Button>
      </BottomSheet>
    )
  }

  const from = personName(people, transfer.fromUserId)
  const to = personName(people, transfer.toUserId)
  const iPay = transfer.fromUserId === meId
  const toIsReal = people.find((p) => p.id === transfer.toUserId)?.hasMoni ?? false
  const sentence = iPay
    ? `Le pasás a ${to}`
    : transfer.toUserId === meId
      ? `${from} te pasa`
      : `${from} le pasa a ${to}`
  const message = `${iPay ? `Te pasé ${formatArs(transfer.amountCents)}` : `Pasame ${formatArs(transfer.amountCents)}`} por Moni 🙌`

  async function markSettled() {
    if (!transfer) return
    setError(null)
    try {
      if (iPay && toIsReal) {
        const values = settlementFormSchema.parse({
          toUser: transfer.toUserId,
          amount: formatAmountInput(transfer.amountCents),
          occurredOn: todayIso(),
          note: method,
          accountId:
            method === 'Efectivo'
              ? (accounts.data?.find((a) => a.kind === 'cash')?.id ?? null)
              : null,
        })
        await create.mutateAsync({ groupId, values })
      } else {
        addSimSettlement(groupId, {
          fromId: transfer.fromUserId,
          toId: transfer.toUserId,
          cents: transfer.amountCents,
          method,
          occurredOn: todayIso(),
        })
      }
      toast.show('Cuenta saldada', { mascotUrl: mascotHappy })
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  const other = iPay ? to : from
  return (
    <BottomSheet title="Saldar cuentas" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center rounded-[24px] bg-forest px-4 py-5 text-cream">
          <div className="flex items-center gap-3">
            <Avatar name={from} size="lg" />
            <ChevronRight aria-hidden="true" className="size-6 text-lime" />
            <Avatar name={to} size="lg" />
          </div>
          <p className="mt-2 text-[17px] text-text-muted-on-dark">{sentence}</p>
          <p className="font-display text-[44px] font-extrabold leading-[50px] text-lime">
            {formatArs(transfer.amountCents)}
          </p>
        </div>
        {mine.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {mine.map((t, i) => (
              <ChoiceChip
                key={`${t.fromUserId}-${t.toUserId}`}
                selected={i === index}
                onClick={() => setIndex(i)}
              >
                {personName(people, t.fromUserId)} → {personName(people, t.toUserId)}
              </ChoiceChip>
            ))}
          </div>
        )}
        <SectionLabel>{iPay ? '¿Cómo se lo pasaste?' : '¿Cómo te lo pasó?'}</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <ChoiceChip
              key={m.label}
              icon={m.icon}
              selected={method === m.label}
              onClick={() => setMethod(m.label)}
            >
              {m.label}
            </ChoiceChip>
          ))}
        </div>
        <MoniSays>
          queda como un pago entre ustedes. No cuenta como gasto ni como ingreso tuyo.
        </MoniSays>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void markSettled()} disabled={create.isPending}>
          {create.isPending ? 'Guardando…' : 'Marcar como saldado'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => toast.show(`Le avisamos a ${other}`)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
          >
            <Bell aria-hidden="true" className="size-5" /> Avisarle a {other}
          </button>
          <button
            type="button"
            onClick={() => void copyText(message, toast, 'Mensaje copiado')}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-white text-[16px] font-extrabold"
          >
            <Copy aria-hidden="true" className="size-5" /> Copiar mensaje
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
