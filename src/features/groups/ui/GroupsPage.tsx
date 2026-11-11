import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import type { DebtDirection } from '@/features/debts/domain/debts'
import { GroupDebtsSheet } from '@/features/debts/ui/GroupDebtsSheet'
import { useCategoryTemplates } from '@/features/categories/api/useCategories'
import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { useGroupLedger } from '../api/useGroupLedger'
import { useMyGroups } from '../api/useGroups'
import { lastExpenseView, mostRecentGroup, splitShortLabel } from '../domain/groupsOverview'
import { personName } from '../domain/ledger'
import { expenseIcon } from './expenseIcon'
import { overlayDeltaFor } from '../domain/ledger'
import { useGroupOverlays } from '../api/useGroupGuests'
import { useGroupPhotos } from '../api/useGroupPhotos'
import { GroupsScreen, type ListedGroup } from './GroupsScreen'

export function GroupsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const groups = useMyGroups()
  const overlays = useGroupOverlays()
  const photos = useGroupPhotos()
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
            photoUrl: photos[g.id]?.url ?? null,
          }
        }),
    [groups.data, overlays, photos, user?.id],
  )

  // "Último en <grupo>": the latest real expense of the group with the most recent activity.
  const recent = listed ? mostRecentGroup(listed) : undefined
  const recentData = useGroupLedger(recent?.id)
  const templates = useCategoryTemplates()
  const lastExpense = useMemo(() => {
    if (!recent) return null
    const view = lastExpenseView(recentData.ledger.expenses, user?.id ?? '')
    if (!view) return null
    const payer = view.paidByMe ? 'Pagaste vos' : `Pagó ${personName(recentData.ledger.people, view.payerId)}`
    const split = splitShortLabel(view.methodLabel, recentData.ledger.expenses[0]?.shares.length ?? 0)
    return {
      groupName: recent.name,
      description: `${view.description} · dividido ${split}`,
      meta: `${payer} · ${formatRelativeDay(view.occurredOn, todayIso()).toLowerCase()}`,
      deltaCents: view.myDeltaCents,
      icon: expenseIcon(templates.data ?? [], view.templateSlug),
    }
  }, [recent, recentData.ledger, templates.data, user?.id])

  return (
    <>
      <GroupsScreen
        lastExpense={lastExpense}
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
