import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import type { DebtDirection } from '@/features/debts/domain/debts'
import { GroupDebtsSheet } from '@/features/debts/ui/GroupDebtsSheet'
import { useMyGroups } from '../api/useGroups'
import { overlayDeltaFor } from '../domain/ledger'
import { useOverlays } from '../mock/overlayStore'
import { GroupsScreen, type ListedGroup } from './GroupsScreen'

export function GroupsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const groups = useMyGroups()
  const overlays = useOverlays()
  // The debts sheet opens from the green box, on the tab of the amount that was tapped.
  const [debtsTab, setDebtsTab] = useState<DebtDirection | null>(null)

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
    <>
      <GroupsScreen
        groups={listed}
        isLoading={groups.isLoading}
        isError={groups.isError}
        onRetry={() => void groups.refetch()}
        onNewGroup={() => navigate('/grupos/nuevo')}
        onOpenDebts={setDebtsTab}
      />
      {debtsTab && <GroupDebtsSheet initialTab={debtsTab} onClose={() => setDebtsTab(null)} />}
    </>
  )
}
