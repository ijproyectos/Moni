import { Trash2, UserPlus } from 'lucide-react'
import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { isInviteActive, memberLabel, type GroupInvite, type GroupMember } from '../domain/group'
import { memberInitial, leaveState } from '../domain/groupView'

interface MembersPanelProps {
  members: readonly GroupMember[]
  invites: readonly GroupInvite[]
  invitesFailed: boolean
  meId: string
  /** Null while the balance is unknown. */
  myNetCents: number | null
  isInviting: boolean
  inviteError: string | null
  onInvite: () => void
  onShowInvite: (invite: GroupInvite) => void
  onRevokeInvite: (invite: GroupInvite) => void
  onLeave: () => void
}

const sectionTitle = 'mb-2 px-1 font-display text-xl font-semibold'

/** "Miembros" tab: people, invites and leaving the group. */
export function MembersPanel({
  members,
  invites,
  invitesFailed,
  meId,
  myNetCents,
  isInviting,
  inviteError,
  onInvite,
  onShowInvite,
  onRevokeInvite,
  onLeave,
}: MembersPanelProps) {
  const today = todayIso()
  const leave = leaveState(myNetCents)
  const activeInvites = invites.filter((i) => isInviteActive(i))

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="members-title">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 id="members-title" className="font-display text-xl font-semibold">
            Miembros
          </h2>
          <button
            type="button"
            onClick={onInvite}
            disabled={isInviting}
            className="flex min-h-11 items-center gap-2 rounded-full bg-lime px-4 font-display text-[15px] font-semibold text-forest disabled:opacity-60"
          >
            <UserPlus aria-hidden="true" className="size-5" />
            Invitar
          </button>
        </div>
        {inviteError && (
          <p role="alert" className="mb-2 px-1 text-sm text-expense">
            {inviteError}
          </p>
        )}
        <Card className="py-1">
          <ul className="divide-y divide-cream">
            {members.map((m) => {
              const name = memberLabel(m)
              return (
                <li key={m.userId} className="flex min-h-14 items-center gap-3 py-2">
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest font-display text-lg font-semibold text-cream"
                  >
                    {memberInitial(name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">
                    {name}
                    {m.userId === meId ? ' (vos)' : ''}
                  </span>
                  {m.role === 'owner' && (
                    <span className="rounded-full bg-lime px-3 py-1 font-display text-sm font-semibold">
                      Dueño
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="invites-title">
        <h2 id="invites-title" className={sectionTitle}>
          Invitaciones activas
        </h2>
        {invitesFailed ? (
          <p role="alert" className="px-1 text-sm text-expense">
            No pudimos cargar las invitaciones.
          </p>
        ) : activeInvites.length === 0 ? (
          <p className="px-1 text-[15px] text-text-muted">
            No hay invitaciones activas. Tocá Invitar para generar un código.
          </p>
        ) : (
          <Card className="py-1">
            <ul className="divide-y divide-cream">
              {activeInvites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onShowInvite(invite)}
                    aria-label={`Ver invitación ${invite.code}`}
                    className="flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center py-2 text-left"
                  >
                    <span className="font-display text-lg font-semibold tracking-[0.15em]">
                      {invite.code}
                    </span>
                    <span className="text-sm text-text-muted">
                      Vence {formatRelativeDay(invite.expiresAt.slice(0, 10), today)} · usos{' '}
                      {invite.uses}/{invite.maxUses}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevokeInvite(invite)}
                    aria-label={`Anular invitación ${invite.code}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-expense"
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="leave-title" className="flex flex-col gap-2">
        <h2 id="leave-title" className="sr-only">
          Salir del grupo
        </h2>
        <Button
          variant="dark"
          onClick={onLeave}
          disabled={!leave.canLeave}
          aria-describedby={leave.reason ? 'leave-reason' : undefined}
        >
          Salir del grupo
        </Button>
        {leave.reason && (
          <p id="leave-reason" className="px-2 text-center text-sm leading-5 text-text-muted">
            {leave.reason}
          </p>
        )}
      </section>
    </div>
  )
}
