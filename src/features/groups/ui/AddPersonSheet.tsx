import { Plus, Sparkles, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { InviteCodeCard } from '@/shared/ui/InviteCodeCard'
import { MoniSays, SectionLabel } from '@/shared/ui/kit'
import { inviteLink } from '../domain/groupView'
import { prettyCode } from '../domain/inviteCode'
import { fieldClass } from './styles'

interface AddPersonSheetProps {
  title?: string
  /** Real invite code of the group; null while the group does not exist yet. */
  code: string | null
  groupName: string
  onClose: () => void
  onAddGuest: (name: string, alias: string) => void
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
  feminine,
}: AddPersonSheetProps) {
  const [guest, setGuest] = useState(false)
  if (guest) {
    return (
      <GuestFormSheet
        onClose={() => setGuest(false)}
        onSubmit={(name, alias) => {
          onAddGuest(name, alias)
          onClose()
        }}
      />
    )
  }
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="rounded-[24px] border border-sand bg-white p-4">
          <div className="flex items-start gap-3">
            <UserPlus aria-hidden="true" className="mt-1 size-6 shrink-0" />
            <div>
              <p className="text-[19px] font-extrabold leading-6">Tiene Moni</p>
              <p className="text-[15px] leading-5 text-text-muted">
                Ve el grupo desde su app y le llegan los avisos.
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
          className="flex items-center gap-3 rounded-[24px] border border-sand bg-white p-4 text-left"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold/45">
            <Plus aria-hidden="true" className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block text-[19px] font-extrabold">No tiene Moni</span>
            <span className="block text-[15px] leading-5 text-text-muted">
              {feminine ? 'La' : 'Lo'} sumás con el nombre. Entra en las cuentas pero no recibe
              avisos.
            </span>
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}

// Screens 081 / 085 / 095 / 098 / 101 — Sumar sin Moni.
export function GuestFormSheet({
  onClose,
  onSubmit,
  initial,
}: {
  onClose: () => void
  onSubmit: (name: string, alias: string) => void
  initial?: { name: string; alias: string }
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [alias, setAlias] = useState(initial?.alias ?? '')
  const display = name.trim() || 'Esta persona'
  return (
    <BottomSheet title="Sumar sin Moni" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSubmit(name.trim(), alias.trim())
        }}
      >
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre"
          maxLength={40}
          placeholder="Ej: Fran"
          className={fieldClass}
          data-autofocus
        />
        <SectionLabel>
          Alias para cobrar{' '}
          <span className="font-bold normal-case tracking-normal">· opcional</span>
        </SectionLabel>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          aria-label="Alias para cobrar"
          maxLength={40}
          placeholder="Ej: fran.mp"
          className={fieldClass}
        />
        <MoniSays
          lead={`${display} cuenta igual.`}
          icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          Aparece en los gastos y en las cuentas, así se hacen bien los números. No ve el grupo ni
          recibe avisos: su parte se la pasás vos copiando el texto.
        </MoniSays>
        <p className="text-[15px] leading-5 text-text-muted">
          Si después se baja Moni, lo invitás y se queda con todo lo cargado.
        </p>
        <Button type="submit" disabled={!name.trim()}>
          Sumar a {name.trim() || 'la persona'}
        </Button>
      </form>
    </BottomSheet>
  )
}
