import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import { debtKeys } from '@/features/debts/api/queryKeys'
import { deleteNotices, dismissCenterEvents, isCenterNotEnabled, purgeOldNotices } from '../api/centerRepository'
import { centerKeys } from './centerKeys'

/** What can be deleted: a notice of a group (its own row) or an event calculated from live data (hidden by its key). */
export interface DeleteTarget {
  key: string
  source: 'notice' | 'derived'
  /** Notice kind: requests and invitations are never hidden by the device fallback, they still need an answer. */
  kind?: string
}

const ASKS_FOR_ANSWER = new Set(['join_request', 'group_invitation', 'payment_reported'])
const localKey = (userId: string | undefined) => `moni-center-dismissed-${userId ?? 'anon'}`

function loadLocal(userId: string | undefined): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(localKey(userId)) ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Deleting a notice never touches the expense, payment, invitation or event behind it: only the notice goes (group notices are rows
 * of the person's own, events calculated from live data are hidden by their key). The server keeps the ones that still need an
 * answer. While the cleanup migration is not applied, the device remembers what was deleted. Old notices (over 7 days) are purged
 * once when the screen opens.
 */
export function useNoticeDeletion() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [local, setLocal] = useState(() => loadLocal(user?.id))

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: centerKeys.reads(user?.id) }),
        queryClient.invalidateQueries({ queryKey: debtKeys.notices(user?.id) }),
      ]),
    [queryClient, user?.id],
  )

  useEffect(() => {
    if (!user) return
    purgeOldNotices().then(refresh, () => undefined)
  }, [user, refresh])

  const remember = useCallback(
    (keys: string[]) => {
      const next = [...new Set([...local, ...keys])].slice(-300)
      setLocal(next)
      try {
        window.localStorage.setItem(localKey(user?.id), JSON.stringify(next))
      } catch {
        // Blocked storage: it lasts while the app stays open.
      }
    },
    [local, user?.id],
  )

  const mutation = useMutation({
    mutationFn: async (targets: DeleteTarget[]): Promise<{ kept: number }> => {
      const ids = targets.filter((t) => t.source === 'notice').map((t) => t.key.replace(/^notice:/, ''))
      const events = targets.filter((t) => t.source === 'derived').map((t) => t.key)
      try {
        const deleted = ids.length > 0 ? await deleteNotices(ids) : 0
        await dismissCenterEvents(events)
        return { kept: ids.length - deleted }
      } catch (e) {
        if (!isCenterNotEnabled(e)) throw e
        const hideable = targets.filter((t) => !(t.kind && ASKS_FOR_ANSWER.has(t.kind)))
        remember(hideable.map((t) => t.key))
        return { kept: targets.length - hideable.length }
      }
    },
    onSuccess: () => refresh(),
  })

  return { removed: new Set(local), remove: mutation.mutateAsync, isRemoving: mutation.isPending }
}
