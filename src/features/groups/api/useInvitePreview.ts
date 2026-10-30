import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import { previewGroupInvite } from './groupsRepository'

/** The real name of the group behind an invite code, read from Supabase before the person confirms joining. */
export function useInvitePreview(code: string, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['groups', user?.id, 'invite-preview', code] as const,
    enabled: Boolean(user) && enabled,
    queryFn: () => previewGroupInvite(code),
    // A wrong code counts as a failed attempt on the server: never retry it by itself.
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}
