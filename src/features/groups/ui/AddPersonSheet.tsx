import { Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { InviteCodeCard } from '@/shared/ui/InviteCodeCard'
import { inviteLink } from '../domain/groupView'
import { prettyCode } from '../domain/inviteCode'
import { GuestsFormSheet, type AddGuestResult } from './GuestsFormSheet'

interface AddPersonSheetProps {
  title?: string
  /** Real invite code of the group; null while the group does not exist yet. */
  code: string | null
  groupName: string
  onClose: () => void
  /** Stores one person: `true`, or the reason it could not be added (shown next to that person). */
  onAddGuest: (name: string, alias: string) => Promise<AddGuestResult> | AddGuestResult
  /** Names the group already has, so nobody is added twice. */
  existingNames?: readonly string[]
  /** Called once with the people that were stored. */
  onAdded?: (names: string[]) => void
  /** Only one person can be added (the partner of a couple). */
  single?: boolean
  /** Pronoun for the guest copy ("La sumás" vs "Lo sumás"). */
  feminine?: boolean
}

// Screens 080 / 084 / 094 / 097 / 100 — Sumar persona (with Moni by code, or without Moni by name).
export function AddPersonSheet({
  title = 'Sumar persona',
  code,
  groupName,
  onClose,
  onAddGuest,
  existingNames,
  onAdded,
  single,
  feminine,
}: AddPersonSheetProps) {
  const [guest, setGuest] = useState(false)
  if (guest) {
    return (
      <GuestsFormSheet
        onClose={() => setGuest(false)}
        onDone={onClose}
        onSubmit={onAddGuest}
        existingNames={existingNames}
        onAdded={onAdded}
        single={single}
      />
    )
  }
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="rounded-[24px] border border-line bg-card p-4">
          <div className="flex items-start gap-3">
            <UserPlus aria-hidden="true" className="mt-1 size-6 shrink-0" />
            <div>
              <p className="text-[19px] font-extrabold leading-6">Invitar con código</p>
              <p className="text-[15px] leading-5 text-text-muted">
                Para quien quiera entrar con su cuenta de Moni: ve el grupo desde su app y le llegan
                los avisos.
              </p>
            </div>
          </div>
          {code ? (
            <div className="mt-3">
              <InviteCodeCard
                embedded
                code={prettyCode(code)}
                description=""
                codeCaption="Código del grupo"
                link={inviteLink(window.location.origin, code)}
                shareText={`Sumate a "${groupName}" en Moni con el código ${code}`}
              />
            </div>
          ) : (
            <p className="mt-3 rounded-[16px] bg-sand px-4 py-3 text-[15px] leading-5">
              Apenas crees el grupo te damos el código para pasarle.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setGuest(true)}
          className="flex items-center gap-3 rounded-[24px] border border-line bg-card p-4 text-left"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tint-gold">
            <Plus aria-hidden="true" className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block text-[19px] font-extrabold">Agregar por nombre</span>
            <span className="block text-[15px] leading-5 text-text-muted">
              {feminine ? 'La' : 'Lo'} sumás solo con el nombre, sin cuenta. Entra en los gastos y
              en las deudas, pero no ve el grupo ni recibe avisos.
            </span>
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}
