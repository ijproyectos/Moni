import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { resolveAvatarUrl } from '@/features/auth/domain/avatar'
import { firstName, initialOf } from '@/features/auth/domain/profile'
import { useProfileExtras } from '../mock/profileExtrasStore'

/** Who the person is, as every profile screen shows it: saved name, initial, photo (a local one wins) and join date. */
export function useProfileIdentity() {
  const { user } = useAuth()
  const query = useProfile()
  const extras = useProfileExtras()
  const profile = query.data
  const saved = profile?.display_name ?? ''
  const shortName = firstName(saved) || user?.email?.split('@')[0] || 'Vos'
  const initial = initialOf(saved, user?.email ?? '')
  const photo = extras.photoRemoved
    ? null
    : resolveAvatarUrl({ uploadedUrl: extras.localPhotoUrl, user, profileUrl: profile?.avatar_url })
  const createdAt = (profile as { created_at?: string } | undefined)?.created_at ?? null
  return {
    user,
    profile,
    isLoading: query.isLoading,
    isError: query.isError,
    saved,
    displayName: saved.trim() || shortName,
    initial,
    photo,
    email: user?.email ?? '',
    createdAt,
  }
}

/** "noviembre de 2026" from the account's creation date; null when it is not known. */
export function joinedLabel(createdAt: string | null): string | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^(\S+) (\d{4})$/, '$1 de $2')
}
