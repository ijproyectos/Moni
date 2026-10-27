import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { useMyGroups } from '../api/useGroups'
import { overlayDeltaFor } from '../domain/ledger'
import { useOverlays } from '../mock/overlayStore'
import { GroupsScreen, type ListedGroup } from './GroupsScreen'

export function GroupsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const groups = useMyGroups()
  const overlays = useOverlays()

  const listed = useMemo<ListedGroup[] | undefined>(
    () =>
      groups.data
        ?.filter((g) => !overlays[g.id]?.deleted)
        .map((g) => {
          const overlay = overlays[g.id]
          return {
            ...g,
            name: overlay?.name ?? g.name,
            myNetCents: g.myNetCents + overlayDeltaFor(overlay, user?.id ?? ''),
            peopleCount: g.memberCount + (overlay?.guests.length ?? 0),
          }
        }),
    [groups.data, overlays, user?.id],
  )

  return (
    <GroupsScreen
      groups={listed}
      isLoading={groups.isLoading}
      isError={groups.isError}
      onRetry={() => void groups.refetch()}
      onNewGroup={() => navigate('/grupos/nuevo')}
    />
  )
}
