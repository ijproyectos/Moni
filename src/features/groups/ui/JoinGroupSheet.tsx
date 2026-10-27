import { useState } from 'react'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { useToast } from '@/shared/ui/toastContext'
import { useJoinGroup } from '../api/useGroups'
import { JoinCodeForm } from './JoinCodeForm'

interface JoinGroupSheetProps {
  onClose: () => void
  onJoined: (groupId: string) => void
}

export function JoinGroupSheet({ onClose, onJoined }: JoinGroupSheetProps) {
  const [error, setError] = useState<string | null>(null)
  const join = useJoinGroup()
  const toast = useToast()

  async function submit(code: string) {
    setError(null)
    try {
      const groupId = await join.mutateAsync(code)
      toast.show('¡Ya sos parte del grupo!', { mascotUrl: mascotGroup })
      onClose()
      onJoined(groupId)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Entrar con código" onClose={onClose}>
      <JoinCodeForm
        isSubmitting={join.isPending}
        submitError={error}
        onSubmit={(code) => void submit(code)}
      />
    </BottomSheet>
  )
}
