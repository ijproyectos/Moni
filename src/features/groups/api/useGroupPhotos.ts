import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import {
  listGroupPhotos,
  removeGroupPhoto,
  uploadGroupPhoto,
  type GroupPhotos,
} from './photosRepository'
import { groupKeys } from './queryKeys'

const NONE: GroupPhotos = {}

/** Photos of all my groups, by group id. Signed links are never persisted (see PersistedQueryProvider). */
export function useGroupPhotos(): GroupPhotos {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: groupKeys.photos(user?.id),
    enabled: Boolean(user),
    queryFn: listGroupPhotos,
    // The link lasts a day; renew it well before and whenever the app is reopened.
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  })
  // Until the migration exists (or while offline) groups keep their icon.
  return query.data ?? NONE
}

export function useGroupPhoto(groupId: string | undefined): string | null {
  const photos = useGroupPhotos()
  return (groupId && photos[groupId]?.url) || null
}

export function useSetGroupPhoto() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ groupId, image }: { groupId: string; image: Blob }) =>
      uploadGroupPhoto(groupId, image),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.photos(user?.id) }),
  })
}

export function useRemoveGroupPhoto() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (groupId: string) => removeGroupPhoto(groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.photos(user?.id) }),
  })
}
