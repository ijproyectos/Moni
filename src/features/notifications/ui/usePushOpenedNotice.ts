import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { debtKeys } from '@/features/debts/api/queryKeys'
import { markCenterRead, openNoticeFromPush } from '../api/centerRepository'
import { PUSH_EVENT_KEY } from '../domain/pushKeys'
import { centerKeys } from './centerKeys'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Tapping a push opens the app at `...?aviso=<id>&push=1` (see public/push-sw.js). The notice that push was about is marked as read
 * and taken out of the notice center in Supabase (a notice that still waits for an answer stays, read), the counters refresh at
 * once, and the `push` marker is dropped from the address so a reload or a sync never repeats it. In-app taps on a notice carry
 * no marker and are not affected.
 */
export function usePushOpenedNotice() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const handled = useRef<Set<string>>(new Set())
  const fromPush = params.get('push') === '1'
  const id = params.get('aviso')

  useEffect(() => {
    if (!fromPush || !user) return
    const next = new URLSearchParams(params)
    next.delete('push')
    setParams(next, { replace: true })
    if (!id || handled.current.has(id)) return
    // A payment due or a registered charge: derived events, read by key (the same keys the notice center uses).
    if (PUSH_EVENT_KEY.test(id)) {
      handled.current.add(id)
      markCenterRead([id])
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: centerKeys.reads(user.id) }))
      return
    }
    if (!UUID.test(id)) return
    handled.current.add(id)
    openNoticeFromPush(id)
      .catch(() => undefined)
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: centerKeys.reads(user.id) })
        void queryClient.invalidateQueries({ queryKey: debtKeys.notices(user.id) })
      })
  }, [fromPush, id, params, setParams, user, queryClient])
}
