import { useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { isCreditCard } from '@/features/accounts/domain/account'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'

interface PaymentAccountSheetProps {
  title: string
  description: string
  confirmLabel: string
  /** Without it an account is required (confirming a payment); with it the person may skip the account. */
  noneLabel?: string
  busy?: boolean
  onConfirm: (accountId: string | null) => void
  onClose: () => void
}

const field =
  'h-12 w-full rounded-2xl border border-line bg-card px-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink'

/** Picks the account a group payment goes in or out of. Cards are left out: a debt payment is money, not credit. */
export function PaymentAccountSheet({
  title,
  description,
  confirmLabel,
  noneLabel,
  busy = false,
  onConfirm,
  onClose,
}: PaymentAccountSheetProps) {
  const accounts = useAccounts()
  const list = (accounts.data ?? []).filter((a) => !isCreditCard(a))
  const [choice, setChoice] = useState<string | undefined>(undefined)
  const selected = choice ?? list[0]?.id ?? ''

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[16px] leading-6 text-text-muted">{description}</p>
        {list.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">Cuenta</span>
            <select
              className={field}
              value={selected}
              onChange={(event) => setChoice(event.target.value)}
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
        {list.length === 0 && !accounts.isLoading && (
          <p className="text-center text-text-muted">Primero creá una cuenta en Medios de pago.</p>
        )}
        <Button variant="dark" disabled={busy || !selected} onClick={() => onConfirm(selected)}>
          {confirmLabel}
        </Button>
        {noneLabel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(null)}
            className="min-h-11 text-[15px] font-semibold text-text-muted underline-offset-2 hover:underline"
          >
            {noneLabel}
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
