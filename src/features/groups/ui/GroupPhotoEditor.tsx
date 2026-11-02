import { useState } from 'react'
import type { GroupKind } from '@/shared/lib/database.types'
import { toUserMessage } from '@/shared/lib/errors'
import { optimizePhoto } from '@/shared/lib/imageOptimize'
import { useToast } from '@/shared/ui/toastContext'
import { useGroupPhoto, useRemoveGroupPhoto, useSetGroupPhoto } from '../api/useGroupPhotos'
import { GroupPhotoPicker } from './GroupPhotoPicker'

/** The photo of an existing group: any member can add, replace or remove it. Changes are saved right away. */
export function GroupPhotoEditor({ groupId, kind }: { groupId: string; kind: GroupKind }) {
  const toast = useToast()
  const photoUrl = useGroupPhoto(groupId)
  const setPhoto = useSetGroupPhoto()
  const removePhoto = useRemoveGroupPhoto()
  const [busy, setBusy] = useState(false)

  async function pick(file: File) {
    setBusy(true)
    try {
      const image = await optimizePhoto(file)
      await setPhoto.mutateAsync({ groupId, image })
      toast.show(photoUrl ? 'Foto cambiada' : 'Foto agregada')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await removePhoto.mutateAsync(groupId)
      toast.show('Foto quitada')
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <GroupPhotoPicker
      kind={kind}
      photoUrl={photoUrl}
      busy={busy}
      onPick={(file) => void pick(file)}
      onRemove={() => void remove()}
    />
  )
}
