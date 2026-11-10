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
import { fieldClass } from './styles'
import { personName, type Person } from '../domain/ledger'
import type { Transfer } from '../domain/split'
import { FEATURES } from '@/shared/config/features'
import { useCreateGuestSettlement } from '../api/useGroupGuests'

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
  const createGuest = useCreateGuestSettlement()
  const accounts = useAccounts()
  const mine = transfers.filter((t) => t.fromUserId === meId || t.toUserId === meId)
  const [index, setIndex] = useState(0)
  const [method, setMethod] = useState('Transferencia')
  // Optional: the own account the money moved in or out of (only for payments recorded in the group).
  const [accountId, setAccountId] = useState('')
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
  const saving = create.isPending || createGuest.isPending
  const iReceive = transfer.toUserId === meId
  // Payments between two members where I pay already move my account through the shared settlement.
  const canPickAccount = !(iPay && toIsReal) && (iPay || iReceive)
  const pickable = (accounts.data ?? []).filter((a) => a.kind !== 'credit_card' && !a.archivedAt)
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
        await createGuest.mutateAsync({
          groupId,
          settlement: {
            fromId: transfer.fromUserId,
            toId: transfer.toUserId,
            cents: transfer.amountCents,
            method,
            occurredOn: todayIso(),
            accountId: accountId || null,
          },
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
            <ChevronRight aria-hidden="true" className="size-6 text-cream" />
            <Avatar name={to} size="lg" />
          </div>
          <p className="mt-2 text-[17px] text-text-muted-on-dark">{sentence}</p>
          <p className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight text-cream">
            {formatArs(transfer.amountCents)}
          </p>
        </div>
        {mine.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {mine.map((t, i) => (
              <ChoiceChip
                key={`${t.fromUserId}-${t.toUserId}`}
                selected={i === index}
                onClick={() => {
                  setIndex(i)
                  setAccountId('')
                }}
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
        {canPickAccount && pickable.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted">
              {iReceive ? '¿En qué cuenta lo recibiste?' : '¿Desde qué cuenta lo pagaste?'}
              <span className="font-bold normal-case tracking-normal"> · opcional</span>
            </span>
            <select
              className={fieldClass}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Sin cuenta: solo saldar la deuda</option>
              {pickable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <MoniSays>
          {canPickAccount && accountId
            ? `queda como un pago entre ustedes y ${iReceive ? 'se suma a' : 'se descuenta de'} tu cuenta. No cuenta como gasto ni como ingreso tuyo.`
            : 'queda como un pago entre ustedes. No cuenta como gasto ni como ingreso tuyo.'}
        </MoniSays>
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void markSettled()} disabled={saving}>
          {saving ? 'Guardando…' : 'Marcar como saldado'}
        </Button>
        <div className={FEATURES.notifications ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
          {FEATURES.notifications && (
            <button
              type="button"
              onClick={() => toast.show(`Le avisamos a ${other}`)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-line bg-card text-[16px] font-extrabold"
            >
              <Bell aria-hidden="true" className="size-5" /> Avisarle a {other}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyText(message, toast, 'Mensaje copiado')}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-line bg-card text-[16px] font-extrabold"
          >
            <Copy aria-hidden="true" className="size-5" /> Copiar mensaje
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
