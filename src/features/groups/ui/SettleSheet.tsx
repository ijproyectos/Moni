import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import type { Cents } from '@/shared/lib/money'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateSettlement } from '../api/useGroups'
import type { GroupMember, SettlementFormValues } from '../domain/group'
import { SettleForm } from './SettleForm'

interface SettleSheetProps {
  groupId: string
  recipients: readonly GroupMember[]
  initialToUser?: string
  initialAmountCents?: Cents
  onClose: () => void
}

export function SettleSheet({
  groupId,
  recipients,
  initialToUser,
  initialAmountCents,
  onClose,
}: SettleSheetProps) {
  const [error, setError] = useState<string | null>(null)
  const accounts = useAccounts()
  const create = useCreateSettlement()
  const toast = useToast()

  async function submit(values: SettlementFormValues) {
    setError(null)
    try {
      await create.mutateAsync({ groupId, values })
      toast.show('Pago registrado', { mascotUrl: mascotHappy })
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Saldar" onClose={onClose}>
      <SettleForm
        recipients={recipients}
        accounts={accounts.data ?? []}
        initialToUser={initialToUser}
        initialAmountCents={initialAmountCents}
        isSubmitting={create.isPending}
        submitError={error}
        onSubmit={(values) => void submit(values)}
      />
    </BottomSheet>
  )
}
