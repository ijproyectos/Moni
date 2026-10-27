import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMyGroups } from '../api/useGroups'
import { GroupsScreen } from './GroupsScreen'
import { JoinGroupSheet } from './JoinGroupSheet'
import { NewGroupSheet } from './NewGroupSheet'

type Sheet = 'new' | 'join' | null

export function GroupsPage() {
  const [sheet, setSheet] = useState<Sheet>(null)
  const navigate = useNavigate()
  const groups = useMyGroups()

  return (
    <>
      <GroupsScreen
        groups={groups.data}
        isLoading={groups.isLoading}
        isError={groups.isError}
        onRetry={() => void groups.refetch()}
        onNewGroup={() => setSheet('new')}
        onJoinWithCode={() => setSheet('join')}
      />
      {sheet === 'new' && (
        <NewGroupSheet
          onClose={() => setSheet(null)}
          onCreated={(groupId) => navigate(`/grupos/${groupId}`)}
        />
      )}
      {sheet === 'join' && (
        <JoinGroupSheet
          onClose={() => setSheet(null)}
          onJoined={(groupId) => navigate(`/grupos/${groupId}`)}
        />
      )}
    </>
  )
}
