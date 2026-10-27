import { useState } from 'react'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateGroup } from '../api/useGroups'
import type { GroupFormValues } from '../domain/group'
import { GroupForm } from './GroupForm'

interface NewGroupSheetProps {
  onClose: () => void
  onCreated: (groupId: string) => void
}

export function NewGroupSheet({ onClose, onCreated }: NewGroupSheetProps) {
  const [error, setError] = useState<string | null>(null)
  const create = useCreateGroup()
  const toast = useToast()

  async function submit(values: GroupFormValues) {
    setError(null)
    try {
      const groupId = await create.mutateAsync(values)
      toast.show('Grupo creado', { mascotUrl: mascotGroup })
      onClose()
      onCreated(groupId)
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Nuevo grupo" onClose={onClose}>
      <GroupForm
        isSubmitting={create.isPending}
        submitError={error}
        onSubmit={(values) => void submit(values)}
      />
    </BottomSheet>
  )
}
