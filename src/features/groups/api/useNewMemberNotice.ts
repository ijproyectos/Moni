import { useEffect, useRef } from 'react'
import { useAuth } from '@/features/auth/api/authContext'
import { firstName } from '@/features/auth/domain/profile'
import { useToast } from '@/shared/ui/toastContext'
import { useGroupMembers } from './useGroups'

/** Who was already announced, by group: screens that mount this hook at the same time announce a newcomer only once. */
const announced = new Set<string>()

/**
 * Tells the person, with a toast, when somebody new joins the group they have open ("¡María se unió al grupo!").
 * The first load of the members is the baseline (nobody is announced for who was already there), the person's own
 * joining is not announced to themself, and the list keeps refreshing on its own (see `useGroupMembers`).
 */
export function useNewMemberNotice(groupId: string | undefined) {
  const { user } = useAuth()
  const toast = useToast()
  const { data } = useGroupMembers(groupId)
  const known = useRef<{ groupId: string; ids: Set<string> } | null>(null)

  useEffect(() => {
    if (!groupId || !data) return
    const active = data.filter((m) => m.leftAt === null)
    if (known.current?.groupId !== groupId) {
      known.current = { groupId, ids: new Set(active.map((m) => m.userId)) }
      for (const m of active) announced.add(`${groupId}:${m.userId}`)
      return
    }
    for (const m of active) {
      if (known.current.ids.has(m.userId)) continue
      known.current.ids.add(m.userId)
      const key = `${groupId}:${m.userId}`
      if (announced.has(key)) continue
      announced.add(key)
      if (m.userId !== user?.id)
        toast.show(`¡${firstName(m.displayName) || 'Alguien'} se unió al grupo!`)
    }
  }, [groupId, data, user?.id, toast])
}
