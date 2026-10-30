import { ChevronRight, Copy, Gift, Trash2, Upload, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { FEATURES } from '@/shared/config/features'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { copyText } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DecisionSheet } from '@/shared/ui/DecisionSheet'
import { Avatar, MoniSays, Page, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { ShareLinkSheet } from '@/shared/ui/ShareLinkSheet'
import { useToast } from '@/shared/ui/toastContext'
import { useReferralLink } from '@/features/pro/ui/useReferralLink'
import { useGroupLedger } from '../api/useGroupLedger'
import { useNewMemberNotice } from '../api/useNewMemberNotice'
import { useCreateInvite, useGroupInvites } from '../api/useGroups'
import { isInviteActive } from '../domain/group'
import { inviteLink } from '../domain/groupView'
import type { Person } from '../domain/ledger'
import { addGuest, removeGuest, updateGuest } from '../mock/overlayStore'
import { prettyCode } from '../domain/inviteCode'
import { AddPersonSheet } from './AddPersonSheet'
import { fieldClass } from './styles'

type Sheet =
  | { type: 'add' }
  | { type: 'edit'; person: Person }
  | { type: 'remove'; person: Person }
  | { type: 'invite'; person: Person }
  | null

// Screens 083 / 086 / 105 / 115 — Personas del grupo.
export function PeoplePage() {
  const { id: groupId = '' } = useParams()
  const toast = useToast()
  const { ledger, name, meId } = useGroupLedger(groupId)
  useNewMemberNotice(groupId)
  const invites = useGroupInvites(groupId)
  const createInvite = useCreateInvite()
  const [sheet, setSheet] = useState<Sheet>(null)
  const code = (invites.data ?? []).find((i) => isInviteActive(i))?.code ?? null

  async function ensureCode(): Promise<string | null> {
    if (code) return code
    try {
      return await createInvite.mutateAsync(groupId)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      return null
    }
  }

  const remaining = ledger.people.length - 1
  return (
    <Page className="pb-28">
      <PageHeader title="Personas" fallbackTo={`/grupos/${groupId}`} />
      <p className="-mt-2 text-[16px] text-text-muted">
        {name} · {ledger.people.length} {ledger.people.length === 1 ? 'persona' : 'personas'}
      </p>
      <ul className="divide-y divide-sand rounded-[24px] border border-sand bg-card">
        {ledger.people.map((p) => {
          const net = ledger.nets[p.id] ?? 0
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => !p.isMe && setSheet({ type: 'edit', person: p })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <Avatar name={p.name} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[19px] font-extrabold">
                    {p.name}
                    {!p.hasMoni && (
                      <span className="rounded-full bg-gold/40 px-2 py-0.5 text-[12px]">
                        Sin Moni
                      </span>
                    )}
                  </span>
                  <span className="block text-[15px] text-text-muted">
                    {p.hasMoni ? 'Tiene Moni' : 'No tiene Moni · lo cargás vos'}
                  </span>
                </span>
                {net !== 0 && (
                  <span className="text-right">
                    <span
                      className={cn(
                        'block text-[19px] font-extrabold',
                        net > 0 ? 'text-income' : 'text-expense',
                      )}
                    >
                      {formatArs(net, { signed: true })}
                    </span>
                    <span className="block text-[14px] text-text-muted">
                      {net > 0 ? 'le deben' : 'debe'}
                    </span>
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {FEATURES.groupGuestsAndSimulatedSplits && (
        <p className="text-[15px] leading-5 text-text-muted">
          Tocá a una persona para editarla o sacarla del grupo. Los que no tienen Moni se cuentan
          igual, pero no reciben avisos.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 rounded-[24px] border border-sand bg-card p-4">
        <div>
          <SectionLabel>Código del grupo</SectionLabel>
          <p className="mt-1 font-display text-[19px] font-extrabold tracking-[0.08em]">
            {code ? prettyCode(code) : invites.isLoading ? '…' : 'Sin código activo'}
          </p>
        </div>
        <button
          type="button"
          disabled={createInvite.isPending}
          onClick={async () => {
            const c = await ensureCode()
            if (c) void copyText(c, toast, 'Código copiado')
          }}
          className="flex min-h-12 items-center gap-2 rounded-full bg-forest px-5 text-[16px] font-extrabold text-cream"
        >
          <Copy aria-hidden="true" className="size-5" /> {code ? 'Copiar' : 'Generar'}
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button onClick={() => setSheet({ type: 'add' })}>
          <UserPlus aria-hidden="true" className="mr-2 size-5" /> Sumar persona
        </Button>
      </div>

      {sheet?.type === 'add' && (
        <AddPersonSheet
          code={code}
          groupName={name}
          onClose={() => setSheet(null)}
          onAddGuest={(n, a) => {
            addGuest(groupId, n, a)
            toast.show(`${n} se sumó al grupo`)
          }}
        />
      )}
      {sheet?.type === 'edit' && (
        <EditPersonSheet
          person={sheet.person}
          onClose={() => setSheet(null)}
          onSave={(n, a) => {
            updateGuest(groupId, sheet.person.id, { name: n, alias: a })
            toast.show('Cambios guardados')
            setSheet(null)
          }}
          onInvite={() => setSheet({ type: 'invite', person: sheet.person })}
          onRemove={() => setSheet({ type: 'remove', person: sheet.person })}
        />
      )}
      {sheet?.type === 'remove' && (
        <DecisionSheet
          icon={<Trash2 className="size-6" />}
          title={`¿Quitar a ${sheet.person.name} del grupo?`}
          onClose={() => setSheet(null)}
          changes={[
            {
              label: 'Personas en las cuentas',
              from: String(ledger.people.length),
              to: String(remaining),
            },
            {
              label: 'Total del grupo',
              from: formatArs(ledger.totalCents),
              to: formatArs(ledger.totalCents),
            },
          ]}
          actions={[
            { label: 'Dejarlo en el grupo', onClick: () => setSheet(null) },
            {
              label: 'Quitar y recalcular',
              tone: 'danger',
              onClick: () => {
                removeGuest(groupId, sheet.person.id)
                toast.show(`${sheet.person.name} ya no está en el grupo`)
                setSheet(null)
              },
            },
          ]}
        >
          <p>
            {sheet.person.name} tiene {formatArs(ledger.paid[sheet.person.id] ?? 0)} puestos y{' '}
            {formatArs(ledger.owed[sheet.person.id] ?? 0)} que le tocan en este grupo. Si lo sacás,
            Moni recalcula las cuentas entre los otros {remaining}.
          </p>
          <p className="mt-3 text-[15px] text-text-muted">
            Si {sheet.person.name} ya te pasó la plata, mejor dejalo y saldá la cuenta.
          </p>
        </DecisionSheet>
      )}
      {sheet?.type === 'invite' && (
        <InviteToMoniSheet
          person={sheet.person}
          groupName={name}
          code={code}
          meId={meId}
          ensureCode={ensureCode}
          onClose={() => setSheet(null)}
        />
      )}
    </Page>
  )
}

// Screens 087 — Editar persona (people without Moni live in the overlay; members with Moni manage themselves).
function EditPersonSheet({
  person,
  onClose,
  onSave,
  onInvite,
  onRemove,
}: {
  person: Person
  onClose: () => void
  onSave: (name: string, alias: string) => void
  onInvite: () => void
  onRemove: () => void
}) {
  const [name, setName] = useState(person.name)
  const [alias, setAlias] = useState(person.alias ?? '')
  if (person.hasMoni) {
    return (
      <BottomSheet title={person.name} onClose={onClose}>
        <div className="flex items-center gap-3">
          <Avatar name={person.name} size="lg" />
          <p className="text-[16px] leading-6">
            Tiene Moni: ve el grupo desde su app. Si quiere irse, sale desde sus opciones del grupo
            cuando esté a mano.
          </p>
        </div>
        <Button className="mt-4" onClick={onClose}>
          Listo
        </Button>
      </BottomSheet>
    )
  }
  return (
    <BottomSheet title={`Editar a ${person.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={person.name} size="lg" />
          <p className="text-[16px] leading-6">
            No tiene Moni. Entra en las cuentas pero no ve el grupo ni recibe avisos.
          </p>
        </div>
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre"
          maxLength={40}
          className={fieldClass}
        />
        <SectionLabel>Alias para cobrar</SectionLabel>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          aria-label="Alias para cobrar"
          maxLength={40}
          className={fieldClass}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onInvite}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-card text-[16px] font-extrabold"
          >
            <UserPlus aria-hidden="true" className="size-5" /> Invitarlo a Moni
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-card text-[16px] font-extrabold text-expense"
          >
            <Trash2 aria-hidden="true" className="size-5" /> Quitar del grupo
          </button>
        </div>
        <Button disabled={!name.trim()} onClick={() => onSave(name.trim(), alias.trim())}>
          Guardar cambios
        </Button>
      </div>
    </BottomSheet>
  )
}

// Screens 125 / 126 — Invitar a alguien sin Moni con un link.
function InviteToMoniSheet({
  person,
  groupName,
  code,
  ensureCode,
  onClose,
}: {
  person: Person
  groupName: string
  code: string | null
  meId: string
  ensureCode: () => Promise<string | null>
  onClose: () => void
}) {
  const toast = useToast()
  const referral = useReferralLink()
  const [preview, setPreview] = useState(false)
  const link = code ? `${window.location.origin}/g/${code}` : `https://${referral}`
  const message = `Te invité al grupo “${groupName}” en Moni. Bajate la app y entrás directo.`
  if (preview)
    return <ShareLinkSheet message={message} url={link} onClose={() => setPreview(false)} />
  return (
    <BottomSheet title={`Invitar a ${person.name}`} onClose={onClose}>
      <p className="text-[16px] leading-6">
        {person.name} no tiene Moni, así que primero la descarga. Con este link se instala la app y
        entra directo a “{groupName}”, ya con sus gastos cargados.
      </p>
      <div className="mt-3 rounded-[18px] bg-sand px-4 py-3">
        <SectionLabel>Link para {person.name}</SectionLabel>
        <p className="mt-1 break-all text-[19px] font-extrabold">
          {link.replace(/^https?:\/\//, '')}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={async () => {
            const c = await ensureCode()
            void copyText(c ? `${window.location.origin}/g/${c}` : link, toast, 'Link copiado')
          }}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest text-[16px] font-extrabold text-cream"
        >
          <Copy aria-hidden="true" className="size-5" /> Copiar link
        </button>
        <button
          type="button"
          onClick={async () => {
            await ensureCode()
            setPreview(true)
          }}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-sand bg-card text-[16px] font-extrabold"
        >
          <Upload aria-hidden="true" className="size-5" /> Compartir
        </button>
      </div>
      <button
        type="button"
        onClick={() => setPreview(true)}
        className="mx-auto mt-3 flex min-h-11 items-center gap-1 text-[16px] font-extrabold"
      >
        Ver cómo lo recibe <ChevronRight aria-hidden="true" className="size-4" />
      </button>
      {FEATURES.referral && (
        <MoniSays
          className="mt-2"
          lead="2 meses de Pro para los dos:"
          icon={<Gift aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          si se registra con tu link, los dos ganan.
        </MoniSays>
      )}
      {code && (
        <p className="mt-2 text-center text-[13px] text-text-muted">
          {inviteLink(window.location.origin, code)}
        </p>
      )}
    </BottomSheet>
  )
}
