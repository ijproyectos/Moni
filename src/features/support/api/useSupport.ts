import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/api/authContext'
import type { TicketDraft } from '../domain/support'
import { supportKeys } from './queryKeys'
import { createSupportTicket, listMyTickets } from './supportRepository'

export function useMyTickets() {
  const { user } = useAuth()
  return useQuery({
    queryKey: supportKeys.tickets(user?.id),
    enabled: Boolean(user),
    queryFn: listMyTickets,
    // The team may have answered since the last visit.
    refetchOnWindowFocus: true,
  })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (draft: TicketDraft) => createSupportTicket(draft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.all(user?.id) }),
  })
}
