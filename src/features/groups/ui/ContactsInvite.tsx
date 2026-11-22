import { Ban, EyeOff, MoreHorizontal, Search, Send, UserRoundCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import mascotAlert from '@/assets/mascot/personaje_alerta-de-presupuesto.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { Avatar, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import {
  useCancelInvitation,
  useContacts,
  useGroupInvitations,
  useGroupMembers,
  useHiddenContacts,
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
  const [showHidden, setShowHidden] = useState(false)

  const memberIds = useMemo(
    () => new Set((members.data ?? []).filter((m) => m.leftAt === null).map((m) => m.userId)),
    [members.data],
  )
  const statusOf = useMemo(() => {
    const map = new Map<string, { id: string; status: InvitationStatus }>()
    for (const i of invitations.data ?? []) if (!map.has(i.userId)) map.set(i.userId, { id: i.id, status: i.status })
    return map
  }, [invitations.data])
  const hidden = useHiddenContacts()

  const list = (contacts.data ?? [])
    .filter((c) => !memberIds.has(c.userId))
    .filter((c) => normalize(c.displayName ?? '').includes(normalize(query.trim())))

  // Nothing to show (no contacts yet, or the database does not have them): the code below stays the way in.
  if ((contacts.data ?? []).length === 0 && (hidden.data ?? []).length === 0) return null

  async function send(userId: string, name: string) {
    try {
      await invite.mutateAsync({ groupId, userId })
      toast.show(`Le mandamos la invitación a ${name}`, { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  async function setPrefs(userId: string, name: string, hide: boolean, block: boolean) {
    setMenuFor(null)
    try {
      await setPref.mutateAsync({ contactId: userId, hidden: hide, blocked: block })
      toast.show(block ? `Bloqueaste a ${name}` : hide ? `Ocultaste a ${name}` : `${name} vuelve a tus contactos`, { mascotUrl: mascotHappy })
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error', mascotUrl: mascotAlert })
    }
  }

  return (
    <section aria-label="Personas de Moni" className="flex flex-col gap-2.5">
      <SectionLabel>Personas de Moni</SectionLabel>
      <p className="-mt-1 text-[14px] leading-5 text-text-muted">
        Gente con la que ya compartiste un grupo. Les llega la invitación y deciden si entran: no hace falta mandar un código.
      </p>
      {(contacts.data ?? []).length > 4 && (
        <label className="flex h-12 items-center gap-2 rounded-full border border-line bg-card px-4">
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
      )}
      {list.length === 0 ? (
        <p className="rounded-[20px] bg-card px-4 py-3 text-[14px] text-text-muted">
          {query ? 'Nadie con ese nombre entre tus contactos.' : 'Todos tus contactos ya están en este grupo.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[20px] bg-card px-3">
          {list.map((c) => {
            const name = c.displayName ?? 'Persona de Moni'
            const state = statusOf.get(c.userId)
            return (
              <li key={c.userId} className="py-2">
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
                      onClick={() => void setPrefs(c.userId, name, true, false)}
                      className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-line px-3 text-[13px] font-extrabold"
                    >
                      <EyeOff aria-hidden="true" className="size-4" /> Ocultar
                    </button>
                    <button
                      type="button"
                      onClick={() => void setPrefs(c.userId, name, true, true)}
                      className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-line px-3 text-[13px] font-extrabold text-expense"
                    >
                      <Ban aria-hidden="true" className="size-4" /> Bloquear
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {(hidden.data ?? []).length > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden(true)}
          className={cn('mx-auto flex min-h-11 items-center gap-2 px-3 text-[14px] font-extrabold text-text-muted')}
        >
          <UserRoundCheck aria-hidden="true" className="size-4" /> Ocultos y bloqueados ({hidden.data?.length})
        </button>
      )}
      {showHidden && (
        <BottomSheet title="Ocultos y bloqueados" onClose={() => setShowHidden(false)}>
          <ul className="flex flex-col divide-y divide-line">
            {(hidden.data ?? []).map((c) => {
              const name = c.displayName ?? 'Persona de Moni'
              return (
                <li key={c.userId} className="flex min-h-16 items-center gap-3 py-2">
                  <Avatar name={name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-extrabold">{name}</span>
                    <span className="block text-[13px] text-text-muted">{c.blocked ? 'Bloqueado' : 'Oculto'}</span>
                  </span>
                  <button
                    type="button"
                    disabled={setPref.isPending}
                    onClick={() => void setPrefs(c.userId, name, false, false)}
                    aria-label={`${c.blocked ? 'Desbloquear a' : 'Mostrar a'} ${name}`}
                    className="flex min-h-11 items-center rounded-full border-2 border-line px-3 text-[13px] font-extrabold disabled:opacity-60"
                  >
                    {c.blocked ? 'Desbloquear' : 'Mostrar'}
                  </button>
                </li>
              )
            })}
          </ul>
        </BottomSheet>
      )}
    </section>
  )
}
