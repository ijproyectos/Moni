import { Archive, CalendarClock, ChevronLeft, ChevronRight, EyeOff, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { GroupKind } from '@/shared/lib/database.types'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { MoniSays, SectionLabel, SplitBar } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import type { Person } from '../domain/ledger'
import { FEATURES } from '@/shared/config/features'
import { type GroupOverlay } from '../mock/overlayStore'
import { useUpdateGroupName } from '../api/useGroups'
import { toUserMessage } from '@/shared/lib/errors'
import { AdminMembersSection, JoinRequestsSection } from './GroupAdminSections'
import { AvatarStack } from './groupVisuals'
import { GroupPhotoEditor } from './GroupPhotoEditor'
import { fieldClass } from './styles'

interface EditGroupSheetProps {
  groupId: string
  kind: GroupKind
  name: string
  people: readonly Person[]
  overlay: GroupOverlay
  onClose: () => void
  /** I am an administrator of the group. */
  isAdmin: boolean
  meId: string | undefined
  onLeave: () => void
  onHide: () => void
  onArchive: () => void
}

// Screens 106 / 109 / 113 / 116 / 130 — Editar grupo. Changes here live in the in-memory overlay.
export function EditGroupSheet({
  groupId,
  kind,
  name,
  people,
  overlay,
  onClose,
  isAdmin,
  meId,
  onLeave,
  onHide,
  onArchive,
}: EditGroupSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [draft, setDraft] = useState(name)
  const rename = useUpdateGroupName()
  const [error, setError] = useState<string | null>(null)
  // "¿Cómo dividen?" of a couple is a simulated, per-device preference (behind a flag that is off): it is not saved by this button.
  const [split, setSplit] = useState(overlay.coupleSplit)
  const partner = people.find((p) => !p.isMe)
  const others = people.filter((p) => !p.isMe)
  const guests = others.filter((p) => !p.hasMoni)

  /** Saves the name in Supabase (administrators). It only says "saved" after the server confirms; otherwise it shows why not. */
  async function save() {
    setError(null)
    const next = draft.trim()
    if (!isAdmin || next === '' || next === name) {
      onClose()
      return
    }
    try {
      await rename.mutateAsync({ groupId, name: next })
      toast.show('Nombre guardado')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Editar grupo" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <MoniSays
          lead={null}
          icon={<Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
        >
          Todos los del grupo pueden editar. Moni avisa cada cambio.
        </MoniSays>
        <SectionLabel>Foto</SectionLabel>
        <GroupPhotoEditor groupId={groupId} kind={kind} />
        <SectionLabel>Nombre</SectionLabel>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Nombre del grupo"
          maxLength={60}
          readOnly={!isAdmin}
          className={fieldClass}
        />
        {!isAdmin && <p className="-mt-2 text-[13px] text-text-muted">Solo los administradores pueden cambiar el nombre.</p>}

        {kind === 'hogar' && (
          <button
            type="button"
            onClick={() => navigate(`/grupos/${groupId}/recurrentes`)}
            className="flex min-h-14 items-center gap-3 rounded-[20px] border border-line bg-card px-4 text-left"
          >
            <CalendarClock aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex-1">
              <span className="block text-[16px] font-extrabold">Gastos recurrentes</span>
              <span className="block text-[13px] text-text-muted">Alquiler, expensas, luz… se registran con un toque cada mes</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        )}
        {kind === 'pareja' && FEATURES.groupGuestsAndSimulatedSplits && (
          <>
            <SectionLabel>¿Cómo dividen?</SectionLabel>
            <SegmentedControl
              label="Cómo dividen"
              value={split}
              onChange={setSplit}
              options={[
                { value: 'half', label: '50/50' },
                { value: 'income', label: 'Según ingresos' },
              ]}
            />
            {split === 'income' && (
              <div className="rounded-[20px] border border-line bg-card p-4">
                <div className="flex justify-between text-[17px] font-extrabold">
                  <span>Vos {Math.round(overlay.incomeShare * 100)} %</span>
                  <span>
                    {partner?.name ?? 'Tu pareja'} {100 - Math.round(overlay.incomeShare * 100)} %
                  </span>
                </div>
                <SplitBar share={overlay.incomeShare} rest="blush" className="mt-2" />
                <p className="mt-2 text-[14px] leading-5 text-text-muted">
                  Los gastos nuevos se dividen así. Los que ya cargaron no cambian.
                </p>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => navigate(`/grupos/${groupId}/personas`)}
          className="flex items-center gap-3 rounded-[22px] border border-line bg-card px-4 py-3 text-left"
        >
          <AvatarStack people={people} size="md" />
          <span className="flex-1">
            <span className="block text-[18px] font-extrabold">Personas</span>
            <span className="block text-[14px] text-text-muted">
              {others.length === 0
                ? 'Solo vos por ahora'
                : `${others.map((o) => o.name).join(' y ')}${guests.length ? ` · ${guests.map((g) => g.name).join(' y ')} sin cuenta` : ''}`}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>

        {isAdmin && <JoinRequestsSection groupId={groupId} />}
        {isAdmin && <AdminMembersSection groupId={groupId} meId={meId} />}

        <SectionLabel>Salir o eliminar</SectionLabel>
        <div className="flex flex-col divide-y divide-line rounded-[20px] bg-card px-4">
          <DangerRow
            icon={<ChevronLeft aria-hidden="true" className="size-5" />}
            title="Salir del grupo"
            text="Dejás de ser integrante. Hace falta tener el saldo en cero."
            onClick={onLeave}
          />
          <DangerRow
            icon={<EyeOff aria-hidden="true" className="size-5" />}
            title="Eliminar para mí"
            text="Solo desaparece de tu lista."
            onClick={onHide}
          />
          {isAdmin && (
            <DangerRow
              icon={<Archive aria-hidden="true" className="size-5" />}
              title="Eliminar para todos"
              text="Se cierra para todos y se les avisa."
              tone="danger"
              onClick={onArchive}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-center text-[15px] text-expense">
            {error}
          </p>
        )}
        <Button onClick={() => void save()} disabled={rename.isPending}>
          {rename.isPending ? 'Guardando…' : isAdmin ? 'Guardar cambios' : 'Listo'}
        </Button>
      </div>
    </BottomSheet>
  )
}

function DangerRow({
  icon,
  title,
  text,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  text: string
  tone?: 'danger'
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left">
      <span className={tone === 'danger' ? 'text-expense' : ''}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-extrabold ${tone === 'danger' ? 'text-expense' : ''}`}>{title}</span>
        <span className="block text-[13px] leading-[18px] text-text-muted">{text}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
    </button>
  )
}
