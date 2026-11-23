import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import { useBudgetStatus } from '@/features/budgets/api/useBudgets'
import { debtKeys } from '@/features/debts/api/queryKeys'
import { useNotices } from '@/features/debts/api/useDebts'
import { useSubscriptions } from '@/features/subscriptions/api/useSubscriptions'
import { todayIso } from '@/shared/lib/month'
import {
  DEFAULT_CENTER_PREFS,
  getCenterPrefs,
  listCenterReads,
  markCenterRead,
  markNoticeRead,
  setCenterPrefs,
  type CenterPrefs,
} from '../api/centerRepository'
import { buildCenterItems, unreadCount, type CenterItem } from '../domain/centerItems'

export const centerKeys = {
  reads: (userId: string | undefined) => ['notice-center', userId, 'reads'] as const,
  prefs: (userId: string | undefined) => ['notice-center', userId, 'prefs'] as const,
}

/** Used only while the database does not have the read table yet: the device remembers, nothing else. */
const localKey = (userId: string | undefined) => `moni-center-read-${userId ?? 'anon'}`
function loadLocal(userId: string | undefined): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(localKey(userId)) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** The preferences of the notice center (saved in Supabase). */
export function useCenterPrefs() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: centerKeys.prefs(user?.id), enabled: Boolean(user), queryFn: getCenterPrefs, retry: false })
  const save = useMutation({
    mutationFn: (prefs: CenterPrefs) => setCenterPrefs(prefs),
    onMutate: async (prefs) => {
      queryClient.setQueryData(centerKeys.prefs(user?.id), prefs)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: centerKeys.prefs(user?.id) }),
  })
  return { prefs: query.data, isAvailable: query.isSuccess, save }
}

/**
 * The general notice center of Moni Plus: real events only (see `buildCenterItems`). Read/unread is kept in Supabase for every
 * notice: the group notices in their own row, the events calculated from live data in `notice_reads`. What the person chose to
 * see comes from their saved preferences.
 */
export function useNotificationCenter() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const today = todayIso()
  const notices = useNotices()
  const subscriptions = useSubscriptions()
  const budgets = useBudgetStatus(today)
  const { prefs } = useCenterPrefs()
  const reads = useQuery({ queryKey: centerKeys.reads(user?.id), enabled: Boolean(user), queryFn: listCenterReads, retry: false })
  const [local, setLocal] = useState(() => loadLocal(user?.id))

  const readKeys = useMemo(() => new Set(reads.isError ? local : (reads.data ?? [])), [reads.isError, reads.data, local])
  const effective = prefs ?? DEFAULT_CENTER_PREFS

  const items = useMemo<CenterItem[]>(
    () =>
      buildCenterItems({
        today,
        notices: notices.data ?? [],
        subscriptions: subscriptions.data?.subscriptions ?? [],
        charges: subscriptions.data?.charges ?? [],
        budgets: budgets.data ?? [],
        show: { paymentsDue: effective.paymentsDue, priceChanges: effective.priceChanges, budgets: effective.budgets },
      }),
    [today, notices.data, subscriptions.data, budgets.data, effective.paymentsDue, effective.priceChanges, effective.budgets],
  )

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: centerKeys.reads(user?.id) }),
        queryClient.invalidateQueries({ queryKey: debtKeys.notices(user?.id) }),
      ]),
    [queryClient, user?.id],
  )

  const remember = useCallback(
    (keys: string[]) => {
      // Only when the database cannot store it (the migration is not there yet).
      const next = [...new Set([...local, ...keys])].slice(-200)
      setLocal(next)
      try {
        window.localStorage.setItem(localKey(user?.id), JSON.stringify(next))
      } catch {
        // Blocked storage: it lasts while the app stays open.
      }
    },
    [local, user?.id],
  )

  const markMutation = useMutation({
    mutationFn: async (list: CenterItem[]) => {
      const derived = list.filter((i) => i.source === 'derived').map((i) => i.key)
      const noticeIds = list.filter((i) => i.source === 'notice').map((i) => i.key.replace(/^notice:/, ''))
      await Promise.all([markCenterRead(derived), ...noticeIds.map((id) => markNoticeRead(id))])
    },
    onSuccess: () => refresh(),
    onError: (_e, list) => remember(list.filter((i) => i.source === 'derived').map((i) => i.key)),
  })

  const isUnread = (item: CenterItem) => (item.source === 'notice' ? !item.readInDb : !readKeys.has(item.key))
  const markRead = (item: CenterItem) => {
    if (isUnread(item)) markMutation.mutate([item])
  }
  const markAllRead = () => markMutation.mutate(items.filter(isUnread))

  return {
    items,
    unread: unreadCount(items, readKeys),
    isUnread,
    markRead,
    markAllRead,
    isLoading: notices.isLoading || subscriptions.isLoading,
  }
}
