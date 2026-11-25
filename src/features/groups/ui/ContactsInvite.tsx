import { MoreHorizontal, Search, Send, UserMinus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Avatar, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import {
  useCancelInvitation,
  useContacts,
  useGroupInvitations,
  useGroupMembers,
  useInviteContact,
  useSetContactPref,
} from '../api/useGroups'
import type { InvitationStatus } from '../domain/group'

const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: 'Invitación enviada',
  accepted: 'Aceptó la invitación',
  declined: 'No aceptó',
  expired: 'La invitación venció',
}

const PREVIEW = 3

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * "Personas de Moni": real people I already shared a group with, to invite them without sending a code. The person gets a notice
 * and decides (nobody is added without accepting). Only a name and a photo of each contact are known. Administrators only: the
 * server checks it again.
 */
export function ContactsInvite({ groupId }: { groupId: string }) {
  const toast = useToast()
  const contacts = useContacts()
  const members = useGroupMembers(groupId)
  const invitations = useGroupInvitations(groupId)
  const invite = useInviteContact()
  const cancel = useCancelInvitation()
  const setPref = useSetContactPref()
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const memberIds = useMemo(
    () => new Set((members.data ?? []).filter((m) => m.leftAt === null).map((m) => m.userId)),
    [members.data],
  )
  const statusOf = useMemo(() => {
    const map = new Map<string, { id: string; status: InvitationStatus }>()
    for (const i of invitations.data ?? []) if (!map.has(i.userId)) map.set(i.userId, { id: i.id, status: i.status })
    return map
  }, [invitations.data])

  const available = (contacts.data ?? []).filter((c) => !memberIds.has(c.userId))
  const list = available.filter((c) => normalize(c.displayName ?? '').includes(normalize(query.trim())))

  // Nothing to show (no contacts yet, or the database does not have them): the code below stays the way in.
  if ((contacts.data ?? []).length === 0) return null

  async function send(userId: string, name: string) {
    try {
      await invite.mutateAsync({ groupId, userId })
      toast.show(`Le mandamos la invitación a ${name}`, { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  /** Only takes the person off the suggestions: no block, no change to shared groups, trips, expenses or balances. */
  async function removeFromList(userId: string, name: string) {
    setMenuFor(null)
    try {
      await setPref.mutateAsync({ contactId: userId, hidden: true, blocked: false })
      toast.show(`Quitaste a ${name} de la lista`, { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  function renderRow(c: (typeof list)[number]) {
    const name = c.displayName ?? 'Persona de Moni'
    const state = statusOf.get(c.userId)
    return (
      <li key={c.userId} className="py-1.5">
        <div className="flex min-h-12 items-center gap-3">
          <Avatar name={name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-extrabold">{name}</span>
            {state && <span className="block text-[13px] text-text-muted">{STATUS_LABEL[state.status]}</span>}
          </span>
          {state?.status === 'pending' ? (
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => void cancel.mutateAsync(state.id).catch((e: unknown) => toast.show(toUserMessage(e), { tone: 'error' }))}
              aria-label={`Cancelar invitación a ${name}`}
              className="flex min-h-11 items-center gap-1 rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-60"
            >
              <X aria-hidden="true" className="size-4" /> Cancelar
            </button>
          ) : (
            <button
              type="button"
              disabled={invite.isPending}
              onClick={() => void send(c.userId, name)}
              aria-label={state ? `Volver a invitar a ${name}` : `Invitar a ${name}`}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-forest px-4 text-[14px] font-extrabold text-cream disabled:opacity-60 dark:bg-lime dark:text-on-bright"
            >
              <Send aria-hidden="true" className="size-4" /> {state ? 'Volver a invitar' : 'Invitar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuFor(menuFor === c.userId ? null : c.userId)}
            aria-label={`Más opciones de ${name}`}
            aria-expanded={menuFor === c.userId}
            className="flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <MoreHorizontal aria-hidden="true" className="size-5" />
          </button>
        </div>
        {menuFor === c.userId && (
          <div className="mb-1 ml-12 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void removeFromList(c.userId, name)}
              className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-line px-3 text-[13px] font-extrabold"
            >
              <UserMinus aria-hidden="true" className="size-4" /> Quitar de la lista
            </button>
          </div>
        )}
      </li>
    )
  }

  const preview = available.slice(0, PREVIEW)

  return (
    <section aria-label="Personas de Moni" className="flex flex-col gap-2">
      <SectionLabel>Personas de Moni</SectionLabel>
      <p className="-mt-1 text-[13px] leading-5 text-text-muted">
        Gente con la que ya compartiste un grupo o viaje. Les llega la invitación y deciden si entran.
      </p>
      {available.length === 0 ? (
        <p className="rounded-[20px] bg-card px-4 py-3 text-[14px] text-text-muted">Todos tus contactos ya están en este grupo.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-card px-3">{preview.map(renderRow)}</ul>
      )}
      {available.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto flex min-h-11 items-center px-3 text-[14px] font-extrabold text-text-muted"
        >
          Ver más
        </button>
      )}
      {showAll && (
        <BottomSheet title="Personas de Moni" onClose={() => setShowAll(false)}>
          <label className="mb-2 flex h-12 items-center gap-2 rounded-full border border-line bg-card px-4">
            <Search aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar entre tus contactos"
              placeholder="Buscar por nombre"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-placeholder"
            />
          </label>
          {list.length === 0 ? (
            <p className="py-3 text-center text-[14px] text-text-muted">Nadie con ese nombre entre tus contactos.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">{list.map(renderRow)}</ul>
          )}
        </BottomSheet>
      )}
    </section>
  )
}
